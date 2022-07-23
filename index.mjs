#!/usr/bin/env zx
import 'zx/globals'
// export AKEYLESS_TOKEN=$(akeyless auth --access-id p-jgk2szbi1vwd --access-type saml --json | jq -r '.token')

if (process.env.KUBERNETES_SERVICE_HOST) {
    process.env.AKEYLESS_KUBECTL_NOT_REQUIRED = true;
}

let verboseLoggingEnabled = false;
if (process.env.AKEYLESS_VERBOSE_LOGGING) {
    verboseLoggingEnabled = true;
}

$.verbose = verboseLoggingEnabled;

let hasKubectl = false;
const validationResults =[];
if (!process.env.AKEYLESS_KUBECTL_NOT_REQUIRED) {
    try {
        const kubectlWhich = await which('kubectl')
        console.log('Found kubectl at      ', kubectlWhich)
        hasKubectl = true;
    } catch (p) {
        console.log('kubectlWhich :', p.toString());
        process.exitCode = 1
    }
}

try {
    const akeylessWhich = await which('akeyless')
    console.log('Found Akeyless CLI at ', akeylessWhich)
} catch (p) {
    console.log('akeylessWhich :', p.toString());
    process.exitCode = 1
}

let akeylessGatewayConfigUrl = '';
if(process.env.AKEYLESS_CONFIG_URL) {
    akeylessGatewayConfigUrl = process.env.AKEYLESS_CONFIG_URL;
} else {
    akeylessGatewayConfigUrl = await question('What is the URL of the Akeyless Gateway Config (default is port 8000)? : ');
}
console.log('akeylessGatewayConfigUrl :', akeylessGatewayConfigUrl);

let akeylessShortToken = '';
if(process.env.AKEYLESS_TOKEN) {
    akeylessShortToken = process.env.AKEYLESS_TOKEN;
} else {
    akeylessShortToken = await question('What is the short token for the Akeyless Authentication? (run "akeyless auth -h" for more details, then authenticate to get the token) : ');
}
// console.log('akeylessShortToken :', akeylessShortToken);
let isValidTokenData = null;
let isValidToken = false;
let isValidTokenStringJSON = '';
try {
    if (process.env.AKEYLESS_API_GW_URL) {
        const tokenValidationCurlFlags = [
            '-s',
            '-k',
            '--request',
            'POST',
            `${process.env.AKEYLESS_API_GW_URL}/validate-token`,
            '--header',
            "Accept: application/json",
            '--header',
            "Content-Type: application/json",
            '--data',
            `{"token":"${akeylessShortToken}"}`
        ];
        const tokenValidationCurlData = await $`curl ${tokenValidationCurlFlags}`;
        const tokenValidationCurlDataJSON = JSON.parse(tokenValidationCurlData?.toString()?.trim());
        isValidToken = tokenValidationCurlDataJSON?.is_valid || false;
    } else {
        isValidTokenData = await $`akeyless validate-token -t ${akeylessShortToken} --json`;
        const isValidTokenStringJSONstring = isValidTokenData?.toString()?.trim();
        isValidTokenStringJSON = JSON.parse(isValidTokenStringJSONstring);
        // console.log('isValidTokenStringJSON :', isValidTokenStringJSON);
        const isValidTokenString = isValidTokenStringJSON?.is_valid;
        if (isValidTokenString == true) {
            console.log('Akeyless Token is valid');
            isValidToken = true;
        } else {
            console.log(`Akeyless Token is invalid : [${isValidToken}]`);
            isValidToken = false;
        }
    }
} catch (error) {
    // console.error(`Akeyless Token is invalid : [${error.toString()}]`);
    isValidToken = false;
}

if(!isValidToken) {
    echo('Akeyless Token is invalid, exiting...');
    echo(chalk.whiteBright.bgRed(`${isValidTokenStringJSON?.reason}`))
    process.exit(1);
}

const akeylessK8sAuthConfigsData = await $`curl -s -H 'Authorization: Bearer ${akeylessShortToken}' ${akeylessGatewayConfigUrl}/config/k8s-auths`;
const akeylessK8sAuthConfigsJSON = JSON.parse(akeylessK8sAuthConfigsData.toString());

const akeylessK8sAuthConfigs = akeylessK8sAuthConfigsJSON?.k8s_auths?.map(a => a.name);
console.log('Current k8s Auth Configs :', akeylessK8sAuthConfigs);
if (!(akeylessK8sAuthConfigs && akeylessK8sAuthConfigs?.length > 0)) {
    echo('No k8s auth configs found, exiting...');
    process.exit(1);
}

let akeylessGatewayK8sAuthConfigName = '';
if(process.env.AKEYLESS_K8S_AUTH_CONFIG_NAME) {
    akeylessGatewayK8sAuthConfigName = process.env.AKEYLESS_K8S_AUTH_CONFIG_NAME;
}

while (!akeylessK8sAuthConfigs.includes(akeylessGatewayK8sAuthConfigName)) {
    const akeylessGatewayK8sAuthConfigNameData = await question('What is the name of the Akeyless Gateway K8s Auth Config? (start typing and press Tab or press Tab twice to see valid options) : ', { choices: akeylessK8sAuthConfigs });
    akeylessGatewayK8sAuthConfigName = akeylessGatewayK8sAuthConfigNameData.toString();
}
console.log('akeylessGatewayK8sAuthConfigName :', akeylessGatewayK8sAuthConfigName);

let akeylessKubeconfig = null;
if (process.env.AKEYLESS_KUBECONFIG_BASE64) {
    const akeylessKubeconfigBase64 = process.env.AKEYLESS_KUBECONFIG_BASE64;
    console.log('Found Akeyless Kubeconfig Base64 in environment variable, using that...');
    akeylessKubeconfig = Buffer.from(akeylessKubeconfigBase64, 'base64');
} else {
    if(!hasKubectl) {
        echo(chalk.whiteBright.bgRed('No kubectl found, exiting...'));
        echo('Set the AKEYLESS_KUBECONFIG_BASE64 environment variable to the base64 encoded kubeconfig file to continue...');
        echo()
        process.exit(1);
    } else {
        const akeylessKubeconfigData = await $`kubectl config view --raw --minify --flatten -o json`
        akeylessKubeconfig = akeylessKubeconfigData.toString();
    }
}
const akeylessKubeconfigJSON = JSON.parse(akeylessKubeconfig);
const kubeClusterCAcertificate = akeylessKubeconfigJSON?.clusters[0]?.cluster?.["certificate-authority-data"];
const kubeClusterHostAPI = akeylessKubeconfigJSON?.clusters[0]?.cluster?.server;

const akeylessK8sAuthConfigJSON = akeylessK8sAuthConfigsJSON?.k8s_auths?.find(a => a.name === akeylessGatewayK8sAuthConfigName);
// console.log('akeylessK8sAuthConfigJSON :', akeylessK8sAuthConfigJSON);

if (akeylessK8sAuthConfigJSON?.k8s_ca_cert === kubeClusterCAcertificate) {
    validationResults.push(chalk.black.bgGreen('  -  Akeyless K8s Auth Config CA cert matches the configuration in kubectl config   '))
    console.log('Akeyless K8s Auth Config CA cert matches the configuration in kubectl config  1 of 3');
} else {
    validationResults.push(chalk.whiteBright.bgRed('  -  Akeyless K8s Auth Config CA cert does not match the configuration in kubectl config   '));
    console.log('Akeyless K8s Auth Config CA cert :', akeylessK8sAuthConfigJSON.k8s_ca_cert);
    console.log('kubectl config CA cert :', kubeClusterCAcertificate);
    process.exit(1);
}

if (akeylessK8sAuthConfigJSON?.k8s_host === kubeClusterHostAPI){
    validationResults.push(chalk.black.bgGreen('  -  Akeyless K8s Auth Config Host matches the configuration in kubectl config   '));
} else {
    validationResults.push(chalk.whiteBright.bgRed('  -  Akeyless K8s Auth Config Host does not match the configuration in kubectl config   '));
    console.log('Akeyless K8s Auth Config Host :', akeylessK8sAuthConfigJSON.k8s_host);
    console.log('kubectl config Host :', kubeClusterHostAPI);
    process.exit(1);
}

let tokenReviewerTestResult = null;
let k8sJWT = null;
if (process.env.KUBERNETES_SERVICE_HOST) {
    console.log('Kubernetes Deployment Detected = KUBERNETES_SERVICE_HOST :', process.env.KUBERNETES_SERVICE_HOST);
    const k8sJWTData = await $`cat /var/run/secrets/kubernetes.io/serviceaccount/token`;
    k8sJWT = k8sJWTData.toString();
    const flags = [
        '-s',
        '-k',
        '-X',
        'POST',
        `https://${process.env.KUBERNETES_SERVICE_HOST}/apis/authentication.k8s.io/v1/tokenreviews`,
        `-H`,
        `Authorization: Bearer ${akeylessK8sAuthConfigJSON?.k8s_token_reviewer_jwt}`,
        `-H`,
        'Content-Type: application/json; charset=utf-8',
        '-d',
        `{"kind": "TokenReview","apiVersion": "authentication.k8s.io/v1","spec": {"token": "${k8sJWT}"}}`
    ];
    tokenReviewerTestResult = await $`curl ${flags}`;
} else {
    console.log('Kubernetes Deployment Not Detected');
    if (process.env.AKEYLESS_K8S_RUNNING_POD_SERVICE_ACCOUNT_TOKEN) {
        const flags = [
            '-s',
            '-k',
            '-X',
            'POST',
            `${kubeClusterHostAPI}/apis/authentication.k8s.io/v1/tokenreviews`,
            `-H`,
            `Authorization: Bearer ${akeylessK8sAuthConfigJSON?.k8s_token_reviewer_jwt}`,
            `-H`,
            `Content-Type: application/json; charset=utf-8`,
            '-d',
            `{"kind": "TokenReview","apiVersion": "authentication.k8s.io/v1","spec": {"token": "${process.env.AKEYLESS_K8S_RUNNING_POD_SERVICE_ACCOUNT_TOKEN}"}}`
        ];
        console.log('flags', flags);
        tokenReviewerTestResult = await $`curl ${flags}`;
    } else {
        echo(`Kubernetes not detected and no JWT from a running pod was supplied so unable to test token reviewer`);
        echo(`Set the AKEYLESS_K8S_RUNNING_POD_SERVICE_ACCOUNT_TOKEN environment variable to be the value of a k8s JWT from a running pod`);
        echo(`Run the following command to get a JWT from a running pod:`);
        echo(`kubectl exec -it <pod-name> -- sh -c "cat /var/run/secrets/kubernetes.io/serviceaccount/token"`);
        echo(`e.g. export AKEYLESS_K8S_RUNNING_POD_SERVICE_ACCOUNT_TOKEN="<JWT>"`);
    }
}
if (tokenReviewerTestResult) {
    const tokenReviewerTestResultJSON = JSON.parse(tokenReviewerTestResult?.toString()?.trim());
    if (tokenReviewerTestResultJSON?.status?.authenticated) {
        validationResults.push(chalk.black.bgGreen('  -  Token Reviewer Validated   '));
    } else {
        validationResults.push(chalk.whiteBright.bgRed('  -  Token Reviewer NOT Validated   '));
        echo(`Testing of K8s Token Reviewer results : ${tokenReviewerTestResultJSON?.status?.authenticated}`);
        echo(`TokenReview JSON : ${JSON.stringify(tokenReviewerTestResultJSON,null,2)}`);
    }
}

if (process.env.AKEYLESS_K8S_AUTH_ACCESS_ID) {
    console.log('Akeyless K8s Access ID :', process.env.AKEYLESS_K8S_AUTH_ACCESS_ID);
    if (akeylessK8sAuthConfigJSON?.k8s_access_id === process.env.AKEYLESS_K8S_AUTH_ACCESS_ID) {
        validationResults.push(chalk.black.bgGreen('  -  Akeyless K8s Auth Config Access ID matches the configuration in the k8s auth config   '));
    } else {
        validationResults.push(chalk.whiteBright.bgRed('  -  Akeyless K8s Auth Config Access ID does not match the configuration in the k8s auth config   '));
        console.log('Akeyless K8s Auth Config Access ID :', akeylessK8sAuthConfigJSON.k8s_access_id);
    }
    const k8sJWTbase64 = Buffer.from(k8sJWT).toString('base64');
    const k8sAuthTestFlags = [
        '-s',
        '-k',
        '--request',
        'POST',
        `${process.env.AKEYLESS_API_GW_URL}/auth`,
        '--header',
        "Accept: application/json",
        '--header',
        "Content-Type: application/json",
        '--data',
        `{"access-type":"k8s","k8s-auth-config-name":"${akeylessGatewayK8sAuthConfigName}","access-id":"${process.env.AKEYLESS_K8S_AUTH_ACCESS_ID}","gateway-url":"${process.env.AKEYLESS_CONFIG_URL}","k8s-service-account-token":"${k8sJWTbase64}"}`
    ];
    const k8sAuthTestData = await $`curl ${k8sAuthTestFlags}`;
    const k8sAuthTestDataJSON = JSON.parse(k8sAuthTestData?.toString()?.trim());
    if (k8sAuthTestDataJSON?.token) {
        validationResults.push(chalk.black.bgGreen('  -  K8s Auth Test Passed   '));
    } else {
        validationResults.push(chalk.whiteBright.bgRed('  -  K8s Auth Test Failed   '));
        echo(`K8s Auth Test Data JSON : ${JSON.stringify(k8sAuthTestDataJSON,null,2)}`);
    }
} else {
    validationResults.push(chalk.whiteBright.bgRed(' - Akeyless K8s Auth Access ID not set so unable to test k8s auth'));
    process.exit(1);
}

if (validationResults.length > 0) {
    console.log(chalk.black.bgCyan('   -  - Validation Results -  -   '));
    const validationResultCount = validationResults.length;
    validationResults.forEach((r, i) => console.log(` ${i + 1} of ${validationResultCount} ${r}`));
}
