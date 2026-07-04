output "function_name" {
  description = "Lambda 関数名"
  value       = aws_lambda_function.api.function_name
}

output "api_id" {
  description = "API Gateway (HTTP API) の ID"
  value       = aws_apigatewayv2_api.http.id
}

output "api_execution_arn" {
  description = "API Gateway の execution ARN（他 Lambda のルート追加・権限付与に使用）"
  value       = aws_apigatewayv2_api.http.execution_arn
}

output "api_endpoint" {
  description = "API のベース URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}
