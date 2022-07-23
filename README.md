# Akeyless Kubernetes Authentication Validator

## Prerequisites

- the docker image  devorbitus/akeyless-k8s-auth-validator will need to be added to whatever image repository is used to be able to deploy it to k8s
- the utility is designed to be run from a machine that has kubectl pointed at the target cluster
- the utility is designed to be run from a machine that has the akeyless CLI authenticated with an access ID that is on the allowed Access ID list for the target gateway (you could replace the command that does the akeyless auth command with an actual short token taken from somewhere else but was created with an access ID on the allowed list) {running the akeyless auth command in the CLI}
   Example of akeyless auth command to get Akeyless short token:

   ```sh
    akeyless auth --access-id=<access-id> --access-key=<access-key> | jq -r '.token'
   ```

- the utility is designed to be run using the following command:
  
    ```sh
    kubectl run -q -i -t "alp-$(echo $RANDOM | md5sum | head -c 5; echo;)" \
    --image=devorbitus/akeyless-k8s-auth-validator \
    --restart=Never --rm \
    --env="AKEYLESS_CONFIG_URL=https://my-gateway-config-screen-default-port-8000.example.com" \
    --env="AKEYLESS_TOKEN=<replace-with-akeyless-short-token>" \
    --env="AKEYLESS_K8S_AUTH_CONFIG_NAME=<replace-with-k8s-auth-config-name-on-this-gateway>" \
    --env="AKEYLESS_KUBECONFIG_BASE64=$(kubectl config view --raw --minify --flatten -o json | base64)" \
    --env="AKEYLESS_API_GW_URL=https://my-gateway-api-default-port-8081.example.com" \
    --env="AKEYLESS_VERBOSE_LOGGING=true" \
    --env="AKEYLESS_K8S_AUTH_ACCESS_ID=<replace-with-access-id>"
    ```
