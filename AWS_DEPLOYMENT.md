# HiddenCost AWS deployment

This project uses AWS SAM to deploy the Flask application as one Python Lambda behind API Gateway.

## Prerequisites

- AWS CLI configured
- AWS SAM CLI
- A Python 3.12 runtime

## Deploy

```sh
sam build
sam deploy --guided
```

Use `us-east-1` or another configured region and accept the generated S3 bucket.

After deployment, open the `HiddenCostUrl` from the SAM output.

## Persistence

The current SQLite implementation stores session state in `/tmp`. Lambda `/tmp` is ephemeral and not shared across regions or long-lived invocations. It is suitable for an MVP, but production use should replace SQLite with DynamoDB or another durable database.

## Secrets

Set `HIDDENCOST_SECRET` to a secure random value for production instead of the development default.
