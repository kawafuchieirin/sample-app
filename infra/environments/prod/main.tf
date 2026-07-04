locals {
  env         = "prod"
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
  stage_name  = "$default"
  # 本番では endpoint_url を指定せず、通常の AWS 解決に任せる。
  endpoint_url = ""
  tags         = local.tags
}

module "stats" {
  source            = "../../modules/stats"
  name_prefix       = local.name_prefix
  source_dir        = "${path.module}/../../../api/src"
  table_name        = module.database.table_name
  table_arn         = module.database.table_arn
  api_id            = module.backend.api_id
  api_execution_arn = module.backend.api_execution_arn
  # 本番は endpoint_url を指定せず通常の AWS 解決に任せる。
  endpoint_url = ""
  tags         = local.tags
}

module "frontend" {
  source            = "../../modules/frontend"
  bucket_name       = var.frontend_bucket_name
  enable_cloudfront = true
  tags              = local.tags
}
