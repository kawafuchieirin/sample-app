# prod のステートは S3 で共有管理する（ロックは DynamoDB）。
# バケット/テーブルは infra/bootstrap で作成済み。
terraform {
  backend "s3" {
    bucket         = "taskapp-tfstate-154931139855"
    key            = "prod/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "taskapp-tflock"
    encrypt        = true
  }
}
