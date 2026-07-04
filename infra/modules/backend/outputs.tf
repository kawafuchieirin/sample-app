output "function_name" {
  description = "Lambda 関数名"
  value       = aws_lambda_function.api.function_name
}

output "api_id" {
  description = "API Gateway (HTTP API) の ID"
  value       = aws_apigatewayv2_api.http.id
}

output "api_endpoint" {
  description = "API のベース URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}
