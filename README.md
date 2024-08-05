## About the Application

This is a sample application that demonstrates how to create an OData service using the .NET and CloudFormation. 

## CloudFormation Template to Deploy OData Application on AWS

This CloudFormation template deploys a containerized .NET [OData](https://learn.microsoft.com/en-us/odata/) application to AWS Fargate. The setup includes:

- A VPC with private subnets, a NAT gateway, and necessary security groups.
- An Amazon RDS MySQL database instance.
- An Amazon ECS cluster with a Fargate task running the OData application.
- An internal Network Load Balancer (NLB) to distribute traffic to the ECS service.
- AWS Secrets Manager to securely store the database connection string.
- A bastion host accessible via AWS Systems Manager (SSM) for secure access to private resources.

### Health Check Configuration

The health check configuration is defined in the Target Group resource in the CloudFormation template. The health check is conducted via TCP on port 5042. This is because we are using Network Load Balancer (NLB) and the health check is done at the transport layer. 

## Deploy Stack

You need to have the AWS CLI installed and configured with the necessary permissions to deploy the stack. There is a script `publish-image.sh` that builds the Docker image and pushes it to Amazon ECR. The script requires the `aws` CLI and `docker` to be installed on your machine.

Use `stack-params.json` to provide the necessary parameters for the CloudFormation stack. The parameters include the Environment, the database password. Check the `deploy.yaml` file for more details on the parameters.

This file is not included in the repository because it contains sensitive information.

To deploy the stack, run the following commands:

```bash
cd Sample
./publish-image.sh
aws cloudformation create-stack --stack-name odata-stack --template-body file://deploy.yaml --parameters file://stack-params.json --region us-east-1 --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

## Example Data

The example data can be found in the `data` folder. The data is downloaded from the [https://www.mysqltutorial.org/](http://www.mysqltutorial.org/mysql-sample-database.aspx) website. The data is in the form of SQL scripts. Use bastion host via SSM to connect to the RDS instance and run the SQL scripts to create the database and tables. Connection string can be found in the secrets manager. We are using `customers` and `orders` tables in this example.

To connect to your local mysql database in the development environment, you need to create .env file in the root directory of the project and add the following content: 

```bash
DB_CONNECTION_STRING="Server=HOST_NAME;Database=DATABASE_NAME;User=_DATABASE_USER;Password=PASSWORD_FOR_DATABASE;"
```

This file is not included in the repository because it contains sensitive information.

## Sample Project

Only basic models and controllers are implemented in this project. You can extend the project by adding more models and controllers. Focus is on the CloudFormation template and the deployment process.

## Bastion Host

The bastion host is accessible via AWS Systems Manager (SSM). You can connect to the bastion host using AWS Systems Manager Session Manager. The bastion host is in a public subnet and does not have a public IP address. The bastion host is used to connect to the RDS instance in the private subnet.

## Security

The security groups are configured to allow traffic only from the bastion host to the RDS instance. The ECS service is only accessible via the internal NLB. The RDS instance is not publicly accessible. The database connection string is stored in AWS Secrets Manager.

## Cleanup

To delete the stack, run the following command:

```bash
aws cloudformation delete-stack --stack-name odata-stack --region us-east-1
```

## License

This project is licensed under the MIT License. 