#!/bin/bash

# Set variables
LAMBDA_FUNCTION_NAME="LambdaFunction_PackageUpload"
ZIP_FILE_PATH="upload.zip"
AWS_REGION="us-east-1"
LAMBDA_FUNCTION_NAME2="packagesid"
ZIP_FILE_PATH2="function.zip"
LAMBDA_FUNCTION_NAME3="packages"
ZIP_FILE_PATH3="packages.zip"


# Check for AWS credentials in environment variables
if [[ -z "$AWS_ACCESS_KEY_ID" || -z "$AWS_SECRET_ACCESS_KEY" ]]; then
  echo "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in the environment."
  exit 1
fi

# Navigate to the Lambda directory
cd lambda || { echo "Directory 'lambda' does not exist."; exit 1; }

# Install dependencies
if [ -f "package.json" ]; then
  npm install || { echo "Failed to install dependencies"; exit 1; }
else
  echo "No package.json found; skipping npm install"
fi

# Create the zip file containing the Lambda function and dependencies

# Update the Lambda function code in AWS

aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --zip-file "fileb://$ZIP_FILE_PATH" \
  --region "$AWS_REGION" || { echo "Failed to update Lambda function"; exit 1; }

aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION_NAME3" \
  --zip-file "fileb://$ZIP_FILE_PATH3" \
  --region "$AWS_REGION" || { echo "Failed to update Lambda function"; exit 1; }



aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION_NAME2" \
  --zip-file "fileb://$ZIP_FILE_PATH2" \
  --region "$AWS_REGION" || { echo "Failed to update Lambda function"; exit 1; }



echo "Lambda function '$LAMBDA_FUNCTION_NAME3' updated successfully."
