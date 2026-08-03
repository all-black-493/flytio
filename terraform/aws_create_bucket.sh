#!/bin/bash

set -ex

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 1. Create S3 bucket
aws s3api create-bucket \
    --bucket flyt-africa-terraform-state-bucket \
    --region us-east-2 \
    --create-bucket-configuration LocationConstraint=us-east-2
 

# 2. Enable versioning so a corrupted or truncated state write can be
# rolled back to the previous object version.
aws s3api put-bucket-versioning \
    --bucket flyt-africa-terraform-state-bucket \
    --versioning-configuration Status=Enabled

# 3. Attach the bucket policy. This is a separate API call -
# put-bucket-versioning has no --policy argument, so passing one here
# aborted the whole script on "Unknown options: --policy" (set -e) and
# left the bucket unversioned, unencrypted and without a policy.
aws s3api put-bucket-policy \
    --bucket flyt-africa-terraform-state-bucket \
    --policy "{
        \"Version\": \"2012-10-17\",
        \"Statement\": [
            {
                \"Effect\": \"Allow\",
                \"Principal\": {
                    \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\"
                },
                \"Action\": \"s3:ListBucket\",
                \"Resource\": \"arn:aws:s3:::flyt-africa-terraform-state-bucket\",
                \"Condition\": {
                    \"StringEquals\": {
                        \"s3:prefix\": \"prod/terraform.tfstate\"
                    }
                }
            },
            {
                \"Effect\": \"Allow\",
                \"Principal\": {
                    \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\"
                },
                \"Action\": [
                    \"s3:GetObject\",
                    \"s3:PutObject\"
                ],
                \"Resource\": [
                    \"arn:aws:s3:::flyt-africa-terraform-state-bucket/prod/terraform.tfstate\"
                ]
            },
            {
                \"Effect\": \"Allow\",
                \"Principal\": {
                    \"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\"
                },
                \"Action\": [
                    \"s3:GetObject\",
                    \"s3:PutObject\",
                    \"s3:DeleteObject\"
                ],
                \"Resource\": [
                    \"arn:aws:s3:::flyt-africa-terraform-state-bucket/prod/terraform.tfstate.tflock\"
                ]
            }
        ]
    }"

# 4. Encrypt objects at rest - state files contain resource metadata.
aws s3api put-bucket-encryption \
    --bucket flyt-africa-terraform-state-bucket \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }]
    }'