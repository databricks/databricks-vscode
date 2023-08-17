from pyngrok import ngrok

secret_scope = ""

ngrok.kill()
auth_token = dbutils.secrets.get(scope=secret_scope, key="ngrok")
ngrok.set_auth_token(auth_token)
tunnel = ngrok.connect(5678, "tcp")

print()
print(tunnel.public_url)
