#!/bin/bash

# Set variables
LAMBDA_FUNCTION_NAME="LambdaFunction_PackageUpload"
ZIP_FILE_PATH="upload.zip"
AWS_REGION="us-east-1"
LAMBDA_FUNCTION_NAME2="packagesid"
ZIP_FILE_PATH2="function.zip"
LAMBDA_FUNCTION_NAME3="packages"
ZIP_FILE_PATH3="packages.zip"

# Retry parameters
MAX_RETRIES=3
RETRY_DELAY=5 # seconds

# Function to retry AWS Lambda update-function-code
retry_update_lambda() {
  local function_name=$1
  local zip_file=$2
  local retries=0

  while [ $retries -lt $MAX_RETRIES ]; do
    echo "Attempting to update Lambda function '$function_name' (attempt $((retries + 1))/$MAX_RETRIES)..."
    aws lambda update-function-code \
      --function-name "$function_name" \
      --zip-file "fileb://$zip_file" \
      --region "$AWS_REGION"
    
    if [ $? -eq 0 ]; then
      echo "Lambda function '$function_name' updated successfully."
      return 0
    else
      echo "Failed to update Lambda function '$function_name'. Retrying in $RETRY_DELAY seconds..."
      retries=$((retries + 1))
      sleep $RETRY_DELAY
    fi
  done

  echo "Failed to update Lambda function '$function_name' after $MAX_RETRIES attempts."
  exit 1
}

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

# Retry updating Lambda functions
retry_update_lambda "$LAMBDA_FUNCTION_NAME" "$ZIP_FILE_PATH"
retry_update_lambda "$LAMBDA_FUNCTION_NAME3" "$ZIP_FILE_PATH3"
retry_update_lambda "$LAMBDA_FUNCTION_NAME2" "$ZIP_FILE_PATH2"
