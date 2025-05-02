import { APIGatewayProxyHandlerV2 } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    console.log("Event: ", JSON.stringify(event));

    // Handle GET /crew/{role}/movies/{movieId}
    if (event.pathParameters) {
      const { role, movieId } = event.pathParameters;
      
      console.log("Path parameters:", { role, movieId });
      
      if (!role || !movieId) {
        return {
          statusCode: 400,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ message: "Missing required path parameters" }),
        };
      }

      // Query DynamoDB for the crew member
      const params = {
        TableName: process.env.TABLE_NAME,
        Key: {
          movieId: parseInt(movieId),
          role: role.toLowerCase(),
        },
      };
      
      console.log("DynamoDB Query params:", JSON.stringify(params));
      
      const command = new GetCommand(params);
      const response = await client.send(command);
      
      console.log("DynamoDB Response:", JSON.stringify(response));

      if (!response.Item) {
        return {
          statusCode: 404,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ message: "Crew member not found" }),
        };
      }

      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(response.Item),
      };
    }

    // Default response for unhandled routes
    return {
      statusCode: 404,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "Route not found" }),
    };
  } catch (error: any) {
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      event: event
    });
    
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
    };
  }
};

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
