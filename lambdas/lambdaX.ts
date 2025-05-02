import { SQSHandler, SQSEvent } from "aws-lambda";

export const handler: SQSHandler = async (event: SQSEvent) => {
  try {
    console.log("Received event:", JSON.stringify(event));

    // Process each message in the batch
    for (const record of event.Records) {
      console.log("Processing message:", record.messageId);
      console.log("Message body:", record.body);

      // Parse the SNS message from SQS
      const body = JSON.parse(record.body);
      if (record.eventSource === "aws:sqs") {
        // If the message is from SNS via SQS
        if (body.TopicArn) {
          const snsMessage = JSON.parse(body.Message);
          console.log("SNS message:", snsMessage);
          
          // Add your message processing logic here
          // For example, you could process different message types differently
          await processMessage(snsMessage);
        } else {
          // Direct SQS message
          await processMessage(body);
        }
      }
    }
  } catch (error) {
    console.error("Error processing messages:", error);
    throw error; // Throwing error will cause message to be retried
  }
};

async function processMessage(message: any) {
  // Add your business logic here
  console.log("Processing message content:", message);
  
  // Example: Validate message format
  if (!message) {
    throw new Error("Invalid message format");
  }

  // Example: Process different message types
  if (message.type === "notification") {
    await handleNotification(message);
  } else if (message.type === "alert") {
    await handleAlert(message);
  } else {
    console.log("Unknown message type, skipping processing");
  }
}

async function handleNotification(message: any) {
  console.log("Handling notification:", message);
  // Add notification handling logic
}

async function handleAlert(message: any) {
  console.log("Handling alert:", message);
  // Add alert handling logic
}
