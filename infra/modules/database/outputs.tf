output "table_name" {
  description = "作成した DynamoDB テーブル名"
  value       = aws_dynamodb_table.tasks.name
}

output "table_arn" {
  description = "DynamoDB テーブルの ARN"
  value       = aws_dynamodb_table.tasks.arn
}
