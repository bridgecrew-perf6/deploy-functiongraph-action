import * as core from '@actions/core'
import * as context from './context'
import * as fs from 'fs-extra'
import * as fileutil from './fileUtils'

/**
 * 检查输入的各参数是否正常
 * @param inputs
 * @returns
 */
export function checkInputs(inputs: context.Inputs): boolean {
  if (
    checkObejectIsNull(inputs.ak) ||
    checkObejectIsNull(inputs.sk) ||
    checkObejectIsNull(inputs.endpoint) ||
    checkObejectIsNull(inputs.function_codetype) ||
    checkObejectIsNull(inputs.function_urn) ||
    checkObejectIsNull(inputs.project_id) ||
    checkObejectIsNull(inputs.function_file) 
  ) {
    core.info('Please fill all the required parameters')
    return false
  }

  return true
}

export function checkCodeType(codeType:string){
  if(context.codeTypeArray.indexOf(codeType) > -1){
    return true;
  }
  return false;
}

/**
 * 检查是否是正常的IP地址
 * @param ipaddr
 * @returns
 */
export function checkIPV4Addr(ipaddr: string): boolean {
  let ipRegx = /^((\d|[1-9]\d|1\d\d|2([0-4]\d|5[0-5]))(\.|$)){4}$/
  return ipRegx.test(ipaddr) ? true : false
}

/**
 * 判断字符串是否为空
 * @param s
 * @returns
 */
export function checkObejectIsNull(s: string): boolean {
  if (s == undefined || s == null || s == '' || s.trim().length == 0) {
    return true
  }
  return false
}

/**
 *
 * @param commands 检查是否有影响操作系统安全的高危命令
 * @returns
 */
export function checkCommandsDanger(commands: string[]): boolean {
  var isCommandsDanger: boolean = false
  for (var i = 0; i < commands.length; i++) {
    var command = commands[i]
    if (checkCommandDanger(command)) {
      isCommandsDanger = true
      break
    }
  }
  return isCommandsDanger
}

/**
 * 检查命令行中是否有黑名单中的高危命令
 * @param command
 * @returns
 */
export function checkCommandDanger(command: string): boolean {
  let isCommandDanger = false
  const dangerCommandSet = context.dangerCommandSet;
  for (var i = 0; i < dangerCommandSet.length; i++) {
    if (command.indexOf(dangerCommandSet[i]) > -1) {
      core.info(
        'find danger operation "' +
          dangerCommandSet[i] +
          '" in command line "' +
          command +
          '",please remove it '
      )
      isCommandDanger = true
    }
  }
  i
  return isCommandDanger
}

/**
 * 检查文件或者目录是否存在，并判断文件类型是否匹配
 * 对所有输入的类型进行了校验，不需要defalt了
 * 
 * @param function_type 
 * @param filePath 
 * @returns 
 */
export function checkFileOrDirExist(function_type:string,filePath:string): boolean{
  core.info("check local file " + filePath + " exist");
  let checkResult:boolean = false;
  try {
    const stat = fs.statSync(filePath);
    console.log(stat)
    switch(function_type){
      case "jar" :
        const jarType = fileutil.getFileMimeType(filePath);
        core.info("filePath: "+filePath+"mime type " + jarType);
        if(stat.isFile() && jarType === context.JAR_MIME_TYPE){
          checkResult = true;
        }
        break;
      case "zip" :
        const zipType = fileutil.getFileMimeType(filePath);
        core.info("filePath: "+filePath+"mime type " + zipType);
        if(stat.isFile() && zipType === context.ZIP_MIME_TYPE){
          checkResult = true;
        }
        break;
      case "file" :
        if(stat.isFile() && stat.size >0){ //文件存在且文件的大小不为0
          checkResult = true;
        } else{
          core.info("file path is not file or file is empty");
        }
        break;
      case "dir" :
        const files:string[]=fs.readdirSync(filePath);
        if(stat.isDirectory() && files.length > 0){
          //需要检测目录是否为空
          core.info("dirString[] " + files);
          checkResult = true;
        }else{
          core.info("file path is not directory or dircectory is empty");
        }
        break;       
    }
  } catch (error) {
    core.info("file or directory not exist")
    console.log(error)
  }
  return checkResult;
}


/**
 * 1、region必须在指定范围的region列表中
 * 2、endpoint和function必须在同一个region
 * 3、如果type为obs，obs的region也必须和endpint，function保持一致
 * 校验 endpoint，function urn，obs是否在同一个region，如果不在同一个region无法完成部署
 */
export function checkRegion(inputs:context.Inputs) : boolean{
  const regionArray = context.regionArray
  let endpointRegion = getRegionFromEndpoint(inputs.endpoint,1,".");
  if(checkObejectIsNull(endpointRegion) || regionArray.indexOf(endpointRegion) === -1){
    core.info("can not find any region in endpoint,or region not in avaiable region list");
    return false;
  }
  let urnRegion = getRegionFromEndpoint(inputs.function_urn,2,":");
  if(checkObejectIsNull(endpointRegion) || regionArray.indexOf(endpointRegion) === -1){
    core.info("can not find any region in urn,or region not in avaiable region list");
    return false;
  }
  if(endpointRegion != urnRegion){
    core.info("endping region must the same as urn region");
    return false;
  }
  //文件为obs类型时，需要单独分析obs
  if(inputs.function_codetype === "obs"){
    let obsRegion = getRegionFromEndpoint(inputs.function_file,2,".");
    if(checkObejectIsNull(obsRegion) || regionArray.indexOf(obsRegion) === -1){
      core.info("can not find any region in obs url,or region not in avaiable region list");
      return false;
    }
    if(endpointRegion != obsRegion){
      core.info("endping region must the same as obs region");
      return false;
    }
  }
  return true;
}

/**
 * 从指定的url中分离出region信息
 * endpoint : "https://functiongraph.cn-north-4.myhuaweicloud.com",
 * function_urn :"urn:fss:cn-north-4:0dd8cb413000906a2fcdc019b5a84546:function:default:uploadPluginToJetBrainsMacket:latest",
 * https://huaweihdnbucket.obs.cn-north-4.myhuaweicloud.com/function/publishmarket/index_obs.zip
 * @param endpoint 
 * @returns 
 */
export function getRegionFromEndpoint(url:string,index:number,regix:string) : string{
  let region:string = "";
  let urlArray:string[] = url.split(regix);
  if(urlArray.length >= (index+1)){
    region = urlArray[index];
  }
  core.info("get currentRegion : " + region);
  return region;
}


/**
 * 检查用户配置的function是否存在
 */
//export function checkFunctionExist(){}

/**
 * 
 * @param filePath 从文件路径中获取到文件名，如xxxx.jar,xxxx.zip等
 * @returns 
 */
 export function getFileNameFromPath(filePath:string):string{
  if(filePath.indexOf("/") === -1){
    return filePath;
  }
  const pathArray = filePath.split("/");
  return pathArray[pathArray.length - 1];
}
