#!/usr/bin/env python3

import os
import sys
import json
import time

def main():
    if os.getenv("FAIL") == "yes":
        print("This is just a failing script.", file = sys.stderr)
        sys.exit(1)

    if os.getenv("FAIL") == "logout":
        print("No subscription found. Run 'az account set' to select a subscription.", file=sys.stderr)
        sys.exit(1)

    if os.getenv("FAIL") == "corrupt":
        print("{accessToken: ..corrupt")
        sys.exit(0)
    
    # get unix epoch time in seconds
    expires = int(time.time()) + 10

    if os.getenv("TF_AAD_TOKEN") is None:
        os.environ["TF_AAD_TOKEN"] = "..."

    # format time as iso time
    expires = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(expires))

    # print json string
    print(json.dumps({
        "accessToken": os.getenv("TF_AAD_TOKEN"),
        "expiresOn": expires,
        "subscription": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "tenant": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "tokenType": "Bearer"
    }, indent=4))

if __name__ == "__main__":
    main()