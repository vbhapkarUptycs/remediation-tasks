"use strict";
const {
  S3Client,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
} = require("@aws-sdk/client-s3");
const {
  sendToUptycsRemediationFeedback,
  ApplicationError,
} = require("../utils");

const adderPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Deny",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::<bucket_name>/*",
      Condition: {
        Bool: {
          "aws:SecureTransport": "false",
        },
      },
    },
  ],
};

/**
 *  Block S3 from Public access
 * @param {object} event
 * @param {object} context
 * @param {object} callback
 * @returns
 */
module.exports.handler = async (event, context, callback) => {
  event = event || {};

  console.log(
    " Block S3 Public Access  - Received event:",
    JSON.stringify(event, null, 2)
  );
  try {
    if (!event.region) {
      throw new ApplicationError("Invalid event, no region provided");
    }
    event.lambdaExecutorRecievedTime = new Date();

    const client = new S3Client({ region: event.region });
    const responses = [];

    const bucketName = {
      Bucket: event.bucketName,
    };

    let policy;
    try {
      // GET BUCKET POLICY
      const getCommand = new GetBucketPolicyCommand(bucketName);
      policy = await client.send(getCommand);
      responses.push(policy);
      console.log(policy);
    } catch (err) {
      console.log(err);
    } finally {
      // IF NO POLICY IS ATTACHED TO THE BUCKET
      if (!policy) {
        const addNewPolicyCommand = new PutBucketPolicyCommand(adderPolicy);
        const addNewPolicyResponse = await client.send(addNewPolicyCommand);
        responses.push(addNewPolicyResponse);
        event.response = addNewPolicyResponse;
        console.log(addNewPolicyResponse);
      } else {
        policy = JSON.parse(policy);

        //adderPolicy is policy which will get added to the existing bucket
        adderPolicy.Statement[0].Resource =
          adderPolicy.Statement[0].Resource.replace(
            "<bucket_name>",
            event.bucketName
          );
        policy.Statement.push(adderPolicy.Statement[0]);

        policy = JSON.stringify(policy);
        const updateBucketPolicyInput = {
          Bucket: event.bucketName,
          Policy: policy,
        };

        // PUT BUCKET POLICY
        const putCommand = new PutBucketPolicyCommand(updateBucketPolicyInput);
        const putResponse = await client.send(putCommand);

        responses.push(putResponse);
        event.response = responses;

        console.log(putResponse);
      }
    }
  } catch (err) {
    event.error = err;
    console.error("Error : ", err.message);
  } finally {
    event.lambdaFeedbackDispachedTime = new Date();
    await sendToUptycsRemediationFeedback(event);
  }
};
