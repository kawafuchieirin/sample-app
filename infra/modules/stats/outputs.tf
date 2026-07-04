output "function_name" {
  description = "統計 API の Lambda 関数名"
  value       = aws_lambda_function.stats.function_name
}

output "route_key" {
  description = "追加したルート"
  value       = aws_apigatewayv2_route.stats.route_key
}
