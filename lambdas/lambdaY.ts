import { SQSHandler, SQSEvent, Context } from "aws-lambda";

// Define the message type
interface UserMessage {
  name: string;
  address: {
    street: string;
    city: string;
    country: string;
  };
  email?: string; // email is optional here to check its existence
}

export const handler: SQSHandler = async (event: SQSEvent, context: Context) => {
  console.log("Lambda Y function invoked:", context.functionName);
  console.log("Received event:", JSON.stringify(event, null, 2));

  const failedMessageIds: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    console.log("Processing message:", record.messageId);
    
    try {
      const message = JSON.parse(record.body) as UserMessage;
      
      // Check if email is missing
      if (!message.email) {
        console.log("Message missing email property:", JSON.stringify(message));
        
        // Verify the country requirement
        if (message.address?.country === "Ireland" || message.address?.country === "China") {
          // Log the message that would be sent to Queue B
          console.log("Message would be sent to Queue B:", JSON.stringify(message));
        } else {
          console.log("Message country not Ireland or China, skipping");
        }
      } else {
        console.log("Message has email property, skipping");
      }
    } catch (error) {
      console.error("Error processing message:", error);
      failedMessageIds.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failedMessageIds };
};
