import { SQSHandler, SQSEvent, Context } from "aws-lambda";

// Define the message type
interface UserMessage {
  name: string;
  address: {
    street: string;
    city: string;
    country: string;
  };
  email: string;
}

export const handler: SQSHandler = async (event: SQSEvent, context: Context) => {
  // 增加详细日志，包括函数调用的环境信息
  console.log("Lambda function invoked:", context.functionName);
  console.log("Lambda request ID:", context.awsRequestId);
  console.log("Remaining time (ms):", context.getRemainingTimeInMillis());
  console.log("Log group:", context.logGroupName);
  console.log("Log stream:", context.logStreamName);

  try {
    console.log("Received event:", JSON.stringify(event, null, 2));

    if (!event.Records || event.Records.length === 0) {
      console.warn("No records found in the event");
      return { batchItemFailures: [] };
    }

    const failedMessageIds: { itemIdentifier: string }[] = [];

    // Process each message in the batch
    for (const record of event.Records) {
      console.log("Processing message:", record.messageId);
      console.log("Message body:", record.body);

      try {
        // Parse the message body
        let message: UserMessage;
        try {
          message = JSON.parse(record.body);
        } catch (parseError) {
          console.error("Error parsing message body:", parseError);
          failedMessageIds.push({ itemIdentifier: record.messageId });
          continue;
        }
        
        // Validate message format
        if (!isValidUserMessage(message)) {
          console.error("Invalid message format:", message);
          failedMessageIds.push({ itemIdentifier: record.messageId });
          continue;
        }

        // Process the message
        await processUserMessage(message);
        console.log("Successfully processed message:", record.messageId);
      } catch (processingError) {
        console.error(`Error processing message ${record.messageId}:`, processingError);
        failedMessageIds.push({ itemIdentifier: record.messageId });
      }
    }

    console.log("Completed processing all messages");
    console.log("Failed message IDs:", JSON.stringify(failedMessageIds));
    
    // Return failed message IDs to enable partial batch processing
    return { batchItemFailures: failedMessageIds };
  } catch (error) {
    console.error("Critical error processing messages:", error);
    // 返回所有消息ID作为失败，这样SQS会重试整个批次
    return {
      batchItemFailures: event.Records.map(record => ({
        itemIdentifier: record.messageId
      }))
    };
  }
};

function isValidUserMessage(message: any): message is UserMessage {
  try {
    const valid = (
      message &&
      typeof message.name === "string" &&
      message.address &&
      typeof message.address.street === "string" &&
      typeof message.address.city === "string" &&
      typeof message.address.country === "string" &&
      typeof message.email === "string"
    );
    
    if (!valid) {
      console.log("Message validation failed. Invalid structure:", JSON.stringify(message));
    }
    
    return valid;
  } catch (error) {
    console.error("Error during message validation:", error);
    return false;
  }
}

async function processUserMessage(message: UserMessage) {
  console.log("Processing user message:", {
    name: message.name,
    country: message.address.country,
    email: message.email
  });

  // Here you can add your business logic
  // For example, store in database, send notifications, etc.
  
  if (message.address.country === "Ireland") {
    await handleIrishUser(message);
  } else if (message.address.country === "China") {
    await handleChineseUser(message);
  } else {
    console.log("Message from unsupported country:", message.address.country);
  }
}

async function handleIrishUser(message: UserMessage) {
  console.log("Handling Irish user:", message.name);
  // 模拟处理操作
  await simulateProcessing();
  console.log("Irish user processing completed");
}

async function handleChineseUser(message: UserMessage) {
  console.log("Handling Chinese user:", message.name);
  // 模拟处理操作
  await simulateProcessing();
  console.log("Chinese user processing completed");
}

// 模拟处理延迟
async function simulateProcessing(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 500));
}
