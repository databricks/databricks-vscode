%pip install pyngrok==6.0.0

from pyngrok import ngrok
import os

# this value will be filled in the the extension
auth_token = ""

os.system("pkill ngrok")
ngrok.set_auth_token(auth_token)
tunnel = ngrok.connect(5678, "tcp")

print()
print(tunnel.public_url)
