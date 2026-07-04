# LocalStack 向け AWS プロバイダ設定。
# ダミー認証情報と各サービスのエンドポイント上書きで、本物の AWS の代わりに
# ローカルの LocalStack (http://localhost:4566) に対してリソースを作成する。
provider "aws" {
  region     = var.region
  access_key = "test"
  secret_key = "test"

  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true

  endpoints {
    apigateway   = "http://localhost:4566"
    apigatewayv2 = "http://localhost:4566"
    cloudwatch   = "http://localhost:4566"
    logs         = "http://localhost:4566"
    dynamodb     = "http://localhost:4566"
    iam          = "http://localhost:4566"
    lambda       = "http://localhost:4566"
    s3           = "http://s3.localhost.localstack.cloud:4566"
    sts          = "http://localhost:4566"
  }
}
