/** Keep the stable identity while migrating away from Vercel's reserved DEPLOYMENT_ID. */
export function deploymentEnvironment(values){
 const {DEPLOYMENT_ID:legacy,...env}=values;
 if(!env.CONNECTORS_DEPLOYMENT_ID&&legacy)env.CONNECTORS_DEPLOYMENT_ID=legacy;
 return env;
}
