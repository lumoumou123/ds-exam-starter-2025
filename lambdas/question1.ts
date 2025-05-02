import { APIGatewayProxyHandlerV2 } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    console.log("Event: ", JSON.stringify(event));

    
    if (event.pathParameters) {
      const { role, movieId } = event.pathParameters;
      const queryParams = event.queryStringParameters || {};
      const isVerbose = queryParams.verbose === 'true';
      
      console.log("Path parameters:", { role, movieId });
      console.log("Query parameters:", queryParams);
      
      if (!role || !movieId) {
        return {
          statusCode: 400,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ message: "Missing required path parameters" }),
        };
      }

      if (isVerbose) {
        
        const queryParams = {
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: "movieId = :movieId",
          ExpressionAttributeValues: {
            ":movieId": parseInt(movieId),
          },
        };
        
        console.log("DynamoDB Query params (verbose):", JSON.stringify(queryParams));
        
        const command = new QueryCommand(queryParams);
        const response = await client.send(command);
        
        console.log("DynamoDB Response (verbose):", JSON.stringify(response));

        if (!response.Items || response.Items.length === 0) {
          return {
            statusCode: 404,
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ message: "No crew members found for this movie" }),
          };
        }

        return {
          statusCode: 200,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            movieId: parseInt(movieId),
            crewMembers: response.Items
          }),
        };
      } else {
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
    }

    
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
