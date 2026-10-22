// 本产品配置需求的公开入口；只登记名称、类型和规则，不保存配置值。
export const manifest=Object.freeze({
  "schema": 1,
  "product_id": "tuyufactory",
  "configuration": {
    "id": "tuyufactory",
    "kind": "tuyu",
    "title": "途遇厂家端配置",
    "items": [
      {"environment":"tuyufactory-release","name":"APP_KEY","title":"APP_KEY","description":"厂家端 Android 正式签名材料","revealable":false,"accessLevel":"protected","kind":"android-signing"},
      {"environment":"tuyufactory-release","name":"IOS_KEY","title":"IOS_KEY","description":"厂家端 iOS 正式签名证书","revealable":false,"accessLevel":"protected","kind":"ios-signing"},
      {"environment":"tuyufactory-release","name":"APP_PROFILE","title":"APP_PROFILE","description":"厂家端 iOS 正式描述文件","revealable":false,"accessLevel":"protected","kind":"ios-signing"}
    ]
  }
});
export function describeConfiguration(){return JSON.parse(JSON.stringify(manifest));}

// 本仓流程的公开入口声明；调用方只交付标准传输能力，不拥有产品规则或任务宿主。
export async function describeAction({flow,platform,inputs={}}){
 if(flow!=='release')throw Error('本产品尚未声明该流程入口：'+flow+'·'+platform);
 const {automationClient}=await import('./build.mjs');
 return {repository:automationClient.automationRepository,
  launch:async({token})=>({runID:(await automationClient.dispatchProductAutomation(platform,token,{inputs})).id})};
}
