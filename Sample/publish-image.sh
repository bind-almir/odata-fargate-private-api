# !/bin/bash

accountId=$(aws sts get-caller-identity --query Account --output text)
region="us-east-1"
# docker build -t odata-sample .
docker buildx build --platform=linux/arm64 -t odata-sample .
docker tag odata-sample:latest ${accountId}.dkr.ecr.${region}.amazonaws.com/odata-sample:latest
aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${accountId}.dkr.ecr.${region}.amazonaws.com
docker build -t ${accountId}.dkr.ecr.${region}.amazonaws.com/odata-sample:latest .
aws ecr describe-repositories --repository-names odata-sample --region ${region} || aws ecr create-repository --repository-name odata-sample --region ${region}
docker push ${accountId}.dkr.ecr.${region}.amazonaws.com/odata-sample:latest