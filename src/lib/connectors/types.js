/**
 * @typedef {{id:string,name:string,kind:string,parentId?:string}} Resource
 * @typedef {{id:string,version?:string,operation?:'upsert'|'removed'|'deleted'|'access_lost',timestamp:string,payload:any,files?:{name:string,content:string,contentType:string}[]}} Change
 * @typedef {{changes:Change[],candidateCheckpoint?:any,continuation?:any,resetRequired?:boolean,retryAt?:string,ackHintIds?:string[]}} ChangePage
 * @typedef {{mode:'file'|'record'|'both',folder?:string,recordType?:string,ownerId:string}} Route
 * @typedef {{token:string,accountId?:string,webhookSecret?:string,kind?:string}} Credential
 */
export {};
