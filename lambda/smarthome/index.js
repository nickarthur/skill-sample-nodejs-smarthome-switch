// -*- coding: utf-8 -*-

// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Licensed under the Amazon Software License (the "License"). You may not use this file except in
// compliance with the License. A copy of the License is located at

//    http://aws.amazon.com/asl/

// or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific
// language governing permissions and limitations under the License.

'use strict';

let AWS = require('aws-sdk');
AWS.config.update({region:'us-east-1'});

let AlexaResponse = require("./alexa/skills/smarthome/AlexaResponse");


exports.handler = async function (event, context) {

    // Dump the request for logging - check the CloudWatch logs
    console.log("index.handler request  -----");
    console.log(JSON.stringify(event));

    if (context !== undefined) {
        console.log("index.handler context  -----");
        console.log(JSON.stringify(context));
    }

    // Validate we have an Alexa directive
    if (!('directive' in event)) {
        let aer = new AlexaResponse(
            {
                "name": "ErrorResponse",
                "payload": {
                    "type": "INVALID_DIRECTIVE",
                    "message": "Missing key: directive, Is request a valid Alexa directive?"
                }
            });
        return sendResponse(aer.get());
    }

    // Check the payload version
    if (event.directive.header.payloadVersion !== "3") {
        let aer = new AlexaResponse(
            {
                "name": "ErrorResponse",
                "payload": {
                    "type": "INTERNAL_ERROR",
                    "message": "This skill only supports Smart Home API version 3"
                }
            });
        return sendResponse(aer.get())
    }

    let namespace = ((event.directive || {}).header || {}).namespace;

    // NOTE THIS CODE IS NEEDED OR THE USER WILL NOT BE ABLE
    // TO ACCEPT ACCOUNT LINKING IN THE ALEXA APP !!!!!
    // THIS TOOK HOURS TO DEBUG AND RESEARCH !!!
    // I SHOULD HAVE READ THE DOCS! LOL
    if (namespace.toLowerCase() === 'alexa.authorization') {
        let aar = new AlexaResponse({"namespace": "Alexa.Authorization", "name": "AcceptGrant.Response",});
        return sendResponse(aar.get());
    }

    if (namespace.toLowerCase() === 'alexa.discovery') {
        let adr = new AlexaResponse({"namespace": "Alexa.Discovery", "name": "Discover.Response"});
        let capability_alexa = adr.createPayloadEndpointCapability();
        let capability_alexa_powercontroller = adr.createPayloadEndpointCapability({"interface": "Alexa.PowerController", "supported": [{"name": "powerState"}]});
        adr.addPayloadEndpoint({"endpoint-001": "switch_sample", "capabilities": [capability_alexa, capability_alexa_powercontroller]});
        return sendResponse(adr.get());
    }

    // THIS HANDLES ONE OF MANY POSSIBLE DIRECTIVES
    // AND WILL HANDLE ANY NUMBER OF POSSIBLE DEVICE ENDPOINTS ;-)
    // SO YOU CAN USE THIS PATTERN TO CREATE YOUR OWN SMARTHOME
    // DIRECTIVE HANDLERS
    if (namespace.toLowerCase() === 'alexa.powercontroller') {
        let power_state_value = "OFF";
        if (event.directive.header.name === "TurnOn")
            power_state_value = "ON";

        let endpoint_id = event.directive.endpoint.endpointId;
        let token = event.directive.endpoint.scope.token;
        let correlationToken = event.directive.header.correlationToken;

        // USE THIS HELPER TO BUILD OUR ALEXA RESPONSE
        // NOTE YOU COULD SEND THIS SAME RESPONSE SHAPE
        // ASYNCRONOUSELY
        let ar = new AlexaResponse(
            {
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpoint_id
            }
        );
        ar.addContextProperty({"namespace":"Alexa.PowerController", "name": "powerState", "value": power_state_value});

        // Check for an error when setting the state
        let state_set = sendDeviceState(endpoint_id, "powerState", power_state_value);
        if (!state_set) {
            return new AlexaResponse(
                {
                    "name": "ErrorResponse",
                    "payload": {
                        "type": "ENDPOINT_UNREACHABLE",
                        "message": "Unable to reach endpoint database."
                    }
                }).get();
        }

        // synchronously return response to ALEXA EVENT GATEWAY
        // IN THE ALEXA CLOUDE.
        // NOTE: you could opt to send asyncrhonous responses instead
        return sendResponse(ar.get());
    }

};

function sendResponse(response)
{
    // TODO Validate the response
    console.log("index.handler response -----");
    console.log(JSON.stringify(response));
    return response
}

function sendDeviceState(endpoint_id, state, value) {
    let dynamodb = new AWS.DynamoDB();

    let key = state + "Value";
    let attribute_obj = {};
    attribute_obj[key] = {"Action": "PUT", "Value": {"S": value}};

    let result = dynamodb.updateItem(
        {
            TableName: "SampleSmartHome",
            Key: {"ItemId": {"S": endpoint_id}},
            AttributeUpdates: attribute_obj
        },
        function (err, data) {
            if (err) {
                console.log(err, err.stack); // an error occurred
                return false;
            }
            else {
                console.log(data);           // successful response
                return true;
            }

        });

    console.log(result);
    return true;
}
