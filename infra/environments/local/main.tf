locals {
  env         = "local"
  name_prefix = "${var.project}-${local.env}"
  tags = {
    Project     = var.project
    Environment = local.env
    ManagedBy   = "terraform"
  }
}

module "database" {
  source     = "../../modules/database"
  table_name = "${local.name_prefix}-tasks"
  tags       = local.tags
}

module "backend" {
  source      = "../../modules/backend"
  name_prefix = local.name_prefix
  source_dir  = "${path.module}/../../../backend/src"
  table_name  = module.database.table_name
  table_arn   = module.database.table_arn
  stage_name  = "local"
  # LocalStack 内から DynamoDB へアクセスするためのエンドポイント。
  # コンテナ間通信のため localhost ではなくホスト名 localstack を使う。
  endpoint_url = "http://localstack:4566"
  tags         = local.tags
}

module "frontend" {
  source            = "../../modules/frontend"
  bucket_name       = "${local.name_prefix}-frontend"
  enable_cloudfront = false
  tags              = local.tags
}
