output "state_bucket" {
  description = "Terraform ステート用 S3 バケット名"
  value       = aws_s3_bucket.tfstate.bucket
}

output "lock_table" {
  description = "Terraform ロック用 DynamoDB テーブル名"
  value       = aws_dynamodb_table.tflock.name
}
