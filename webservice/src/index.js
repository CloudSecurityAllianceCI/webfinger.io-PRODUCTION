/**
 * webfinger server
 * 
 * Uses CloudFlare Workers and KV, Mailchannels
 * You'll need a domain name to run this yourself
 */

// wrangler publish --env production  

// Change to variable?
let globalDomain = "webfinger.io";

// npm install uuid
import { v4 as uuidv4 } from 'uuid';

// Separate file to make updates easier
import { getsecuritytxt } from "./securitytxt.js";

// normalize stuff
import { strictNormalizeWebData } from "./strictNormalize.js";
import { strictNormalizeEmailAddress } from "./strictNormalize.js";

// registration content
import { gethtmlContentRegistration } from "./htmlContentRegistration.js";

// webfinger
import { handleWebfingerGETRequest } from "./webfinger.js";

// Processing content email/html
import { gethtmlContentProcessing } from "./htmlContentProcessing.js"
import { getemailContentProcessing } from "./emailContentProcessing.js"

import { handleConfirmationGETRequest } from "./logicConfirmation.js"
import { readConfirmationRequestBodyPOST } from "./logicConfirmation.js"

import { handleVerifiedEmailGETRequest } from "./logicVerifiedEmailPage.js"

// Processing email handler
import { handleEmail } from "./emailHandler.js"

///////////////////////////////////////////////////////////////////////////////////////////////////
// Main POST body
// test via:
// wget --post-data "email_address=test@seifried.org&action=link_mastodon_id&mastodon_id=@iuhku@iuhjkh.com&token=a43fd80f-a924-4c9c-bb53-dad1e6432de7" https://webfinger.io/
///////////////////////////////////////////////////////////////////////////////////////////////////
async function readPOSTRequestBody(request) {

  const { headers } = request;
  const contentType = headers.get('content-type') || '';
  // We're doing POST to get form results
  if (contentType.includes('form')) {
    const formData = await request.formData();
    // Get the body and populate the fields
    postData = {};
    for (const entry of formData.entries()) {
      // TODO: toLowercase this all
      postData[entry[0]] = entry[1];
    }

    normalizedRequestData = strictNormalizeWebData(postData);

    return normalizedRequestData;
  }
  else {
    return false;
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Main GET body
// test via:
// wget -v "https://webfinger.io/testing?email_address=test@seifried.org&action=link_mastodon_id&mastodon_id=iuhku@iuhjkh.com&token=a43fd80f-a924-4c9c-bb53-dad1e6432de7"
///////////////////////////////////////////////////////////////////////////////////////////////////
async function readGETRequestParams(searchParams) {
  paramData = {};
  if (searchParams.get("mastodon_id")) {
    paramData["mastodon_id"] = searchParams.get("mastodon_id")
  }
  if (searchParams.get("action")) {
    paramData["action"] = searchParams.get("action")
  }
  if (searchParams.get("email_address")) {
    paramData["email_address"] = searchParams.get("email_address")
  }
  if (searchParams.get("github_id")) {
    paramData["github_id"] = searchParams.get("github_id")
  }
  if (searchParams.get("linkedin_id")) {
    paramData["linkedin_id"] = searchParams.get("linkedin_id")
  }
  if (searchParams.get("reddit_id")) {
    paramData["reddit_id"] = searchParams.get("reddit_id")
  }
  if (searchParams.get("twitter_id")) {
    paramData["twitter_id"] = searchParams.get("twitter_id")
  }
  if (searchParams.get("token")) {
    paramData["token"] = searchParams.get("token")
  }
  
  let normalizedRequestData = strictNormalizeWebData(paramData);
  return normalizedRequestData;
//  return new Response(JSON.stringify(normalizedRequestData), {status: "200", headers: {"content-type": "text/plain"}});
}


async function readProcessingRequestBodyPOST(request) {
  // TODO: UPDATE LOGIC

  // if unsubscribe or delete requires email address

  // else if need mastodon ID and at least one of email/github/etc.

  // error handling first
  if (request["action"] == "block_email" || request["action"] == "delete_record") {
    if (request["email_address"] === false) {
      return new Response("ERROR: We can't block email without an email address", {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
  }
  else if (request["action"] == "link_mastodon_id") {
    if (request["mastodon_id"] === false) {
      return new Response("ERROR: We can't link something to a Mastodon ID without a Mastodon ID", {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
  }

  // Generate a unique ID early on, we'll need it in a few places (each record type)
  uuid_value = uuidv4();

  // The KV auth data is always the same, multiple records, e.g. email:, github:
  KVauthdata = {};
  KVauthdata["token"] = uuid_value;

  KVauthdataJSONString = JSON.stringify(KVauthdata);

  // Handle github, logic goes inside each one
  if (request["github_id"] != false) {

    // check to see if we already have an auth key, they auto expire, this cuts down on abuse
    KVkeyValue = "github:" + request["github_id"];
    const KVauthresult = await webfingerio_prod_auth.get(KVkeyValue);
    // if we find an auth record that means we have a unique key already set (which expires after one hour) so 
    // no post request and continue so we don't leak info
    if (KVauthresult) {
      // This means we'll bail early and not do email either, no matter what if there's an error we just bail
      return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
    else {
      // do the POST request to the verification API

      // KVauthdataJSONString was set earlier
      // KVkeyValue was set earlier
      await webfingerio_prod_auth.put(KVkeyValue, KVauthdataJSONString, {expirationTtl: 3600});


      verify_api_url = API_URL_VERIFICATION;

      verify_api_post = {};
      verify_api_post["API_TOKEN_VERIFICATION"] = API_TOKEN_VERIFICATION;
      verify_api_post["ACCOUNT_TYPE"] = "github";
      verify_api_post["ACCOUNT_NAME"] = request["github_id"];
      verify_api_post["MASTODON_ID"] = request["mastodon_id"];
      verify_api_post["CALLBACK_URL"] = "https://webfinger.io/confirmation";
      verify_api_post["CALLBACK_TOKEN"] = uuid_value;
    }
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Handle email, logic goes inside each one
  if (request["email_address"] != false) {

    // Check for block email, assume no
    block_email = "No";
    
    // Check for record that contains block_email = Yes
    KVkeyArray = {};
    KVkeyArray = request["email_address"].split("@");
    KVkeyValue = "email:" + KVkeyArray[1] + ":" + KVkeyArray[0]
    const KVDataResult = await webfingerio_prod_data.get(KVkeyValue);
    // remember if no record it returns null, so if it exists we have a record
    if (KVDataResult) {
      KVDataResultJSON = JSON.parse(KVDataResult);
      if (KVDataResultJSON["block_email"] == "Yes") {
        block_email = "Yes";
        // return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
      }
    }

    // check to see if we already have an auth key, they auto expire, this cuts down on abuse
//    KVkeyArray = request["email_address"].split("@");
//    KVkeyValue = "email:" + KVkeyArray[1] + ":" + KVkeyArray[0]
    const KVauthresult = await webfingerio_prod_auth.get(KVkeyValue);
    // if we find an auth record that means we have a unique key already set (which expires after one hour) so set to no email
    // and continue so we don't leak info
    if (KVauthresult) {
      block_email = "Yes";
      return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
    
    // Set an auth key if one doesn't exist
    // Set a one hour time limit, this limits activity and means we don't have to do cleanup if anything fails
    // Don't set keys if block_email = "Yes";
    if (block_email == "No") {
      // KV STORE KEY
   //   KVkeyArray = request["email_address"].split("@");
   //   KVkeyValue = "email:" + KVkeyArray[1] + ":" + KVkeyArray[0]
      await webfingerio_prod_auth.put(KVkeyValue, KVauthdataJSONString, {expirationTtl: 3600});
    }
    else {
      return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }

    // TODO: ENV VRIABLES FROM/REPLYTO
    email_data = {};
    email_data["domain"] = "webfinger.io";
    email_data["to_email"] = request["email_address"];
    email_data["from"] = "noreply@webfinger.io";
    email_data["from_name"] = "webfinger.io Email Verification Service";
    email_data["reply-to"] = "admin@webfinger.io";
    email_data["reply-to_name"] = "webfinger.io Email Verification Admin";
    // TODO: change subject to include random value (click link?) so gmail doesn't thread them
    
    email_data["subject"] = "webfinger.io Email verification";
    // These env variables need to be set in wrangler.toml
    // See docs.webfinger.io/DKIM-setup.md for setup details
    email_data["DKIM_DOMAIN"] = DKIM_DOMAIN;
    email_data["DKIM_SELECTOR"] = DKIM_SELECTOR;
    email_data["DKIM_PRIVATE_KEY"] = DKIM_PRIVATE_KEY;

    user_data = {};
    // We always have a uuid and email
    user_data["token"] = uuid_value;
    // TODO: check if it fails here.
    user_data["email_address"] = request["email_address"];

    user_data["mastodon_id"] = request["mastodon_id"];

    // Send the email template as specified (1 of 3)
    if (request["action"] == "link_mastodon_id") {
      if (block_email == "No") {
        email_content = getemailContentProcessing("link_mastodon_id", user_data);
        email_return_code = await handleEmail(email_data, email_content); 
      }
      return new Response(gethtmlContentProcessing("link_mastodon_id", user_data), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
    else if (request["action"] == "block_email") {
      if (block_email == "No") {
        email_content = getemailContentProcessing("block_email", user_data);      
        email_return_code = await handleEmail(email_data, email_content); 
      }
      return new Response(gethtmlContentProcessing("block_email", user_data), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
    else if (request["action"] == "delete_record") {
      if (block_email == "No") {
        email_content = getemailContentProcessing("delete_record", user_data);  
        email_return_code = await handleEmail(email_data, email_content);
      }
      return new Response(gethtmlContentProcessing("delete_record", user_data), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    } 
    else {
      return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
/////////////////////////////////////////
  }
}


///////////////////////////////////////////////////////////////////////////////////////////////////
// POST Request
// 
// Routes:
// webfinger.io/apiv1/processing/*
// webfinger.io/apiv1/confirmation/*
///////////////////////////////////////////////////////////////////////////////////////////////////
async function handlePOSTRequest(requestData) {
  requestURL = new URL(requestData.url);
  if (requestURL.pathname === "/apiv1/processing") {
    normalizedData = await readPOSTRequestBody(requestData);
    replyBody = await readProcessingRequestBodyPOST(normalizedData);
    return replyBody;
	} 
  else if (requestURL.pathname === "/apiv1/confirmation") {
    // TODO: take confirmation GET request and to the work
    // 
    normalizedData = await readPOSTRequestBody(requestData);
    replyBody = await readConfirmationRequestBodyPOST(normalizedData);
    return replyBody;

//		reqBody = await readPOSTRequestBody(requestData);
 //   replyBody = await jj(reqBody)
  //  return new Response(JSON.stringify(reqBody), {status: "200", headers: {"content-type": "text/plain"}});
//    return reqBody;
	} 

  ///////////////////////////////////////
  // Testing
  //else if (requestURL.pathname === "/testing") {
	//	const reqBody = await readPOSTRequestBody(requestData);
  //  return new Response(JSON.stringify(reqBody), {status: "200", headers: {"content-type": "text/plain"}});
	//} 
  else {
    return Response.redirect("https://webfinger.io/", 307)
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// GET Request
// Routes:
// webfinger.io/
// webfinger.io/robots.txt
// webfinger.io/.well-known/security.txt
// webfinger.io/.well-known/webfinger*
// webfinger.io/apiv1/processing*
// webfinger.io/apiv1/confirmation*
///////////////////////////////////////////////////////////////////////////////////////////////////
async function handleGETRequest(requestData) { 
  // length checks and whatnot here?
  requestURL = new URL(requestData.url);
  // test via
  // https://webfinger.io/.well-known/webfinger?resource=acct:kurt@seifried.org
  if (requestURL.pathname === "/.well-known/webfinger") {
    const webfingerReply = await handleWebfingerGETRequest(requestData);
    return webfingerReply;
  } 
  else if (requestURL.pathname === "/favicon.ico") {
    return Response.redirect("https://cloudsecurityalliance.org/favicon.ico", 307)
  } 
  else if (requestURL.pathname === "/robots.txt") {
    return new Response("User-agent: * Disallow: /", {status: "200", headers: {"content-type": "text/plain"}});
  } 
  else if (requestURL.pathname === "/.well-known/security.txt") {
		return new Response(getsecuritytxt(), {status: "200", headers: {"content-type": "text/plain"}});
	} 
  else if (requestURL.pathname === "/") {
    htmlContent = gethtmlContentRegistration("registration");
    return new Response(htmlContent, {status: "200", headers: {'content-type': 'text/html;charset=UTF-8'}});
	} 
  else if (requestURL.pathname === "/new") {
    let initial_data = {};
    initial_data["uuid"] = uuidv4();
    htmlContent = gethtmlContentRegistration("newregistration", initial_data);
    return new Response(htmlContent, {status: "200", headers: {'content-type': 'text/html;charset=UTF-8'}});
	} 
  else if (requestURL.pathname === "/apiv1/processing") {
    return Response.redirect("https://webfinger.io/", 307)
	} 
  else if (requestURL.pathname === "/apiv1/confirmation") {
    requestURL = new URL(requestData.url);
    const { searchParams } = new URL(requestData.url)
    const reqBody = await readGETRequestParams(searchParams);
    replyBody = handleConfirmationGETRequest(reqBody);
    return replyBody;
	} 
  // startsWith @ means twitter
  else if (requestURL.pathname.startsWith("/@")) {
    return new Response("Twitter account", {status: "200", headers: {"content-type": "text/plain"}});
    //replyBody = await handleVerifiedEmailGETRequest(requestURL.pathname);
    //return replyBody;
	} 
  // an @ in it means it's an email
  else if (requestURL.pathname.includes("@")) {
    replyBody = await handleVerifiedEmailGETRequest(requestURL.pathname);
    return replyBody;
	} 
  // /GitHub/*
  // /u/* reddit
  // /LinkedIn/*
  // /HackerNews/*
  // /Instagram/*
  // /TikTok/*
  // /FaceBook/*
  // /YouTube/*
  // /WhatsApp/*
  // /WeChat/*
  // /dns/*
  // 
  // Things we explicitly will not support:
  // Phone numbers
  // Physical addresses
  // Gov ID numbers
  // Because PII concerns, and we can't verify them safely
  // 
  ////////////////////////////////////////////////////
  // Testing
  // test via
  // wget -v "https://webfinger.io/testing?email_address=test@seifried.org&action=link_mastodon_id&mastodon_id=iuhku@iuhjkh.com&token=a43fd80f-a924-4c9c-bb53-dad1e6432de7"
  //else if (requestURL.pathname === "/testing") {
  //  requestURL = new URL(requestData.url);
  //  const { searchParams } = new URL(requestData.url)
  //  const reqBody = await readGETRequestParams(searchParams);
  //  return new Response(JSON.stringify(reqBody), {status: "200", headers: {"content-type": "text/plain"}});
  //}
  ///////////////////////////////
  // We're at the end, serve a redirect to the registration page
  else {
    return Response.redirect("https://webfinger.io/", 307)
	} 
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Main request handler
///////////////////////////////////////////////////////////////////////////////////////////////////
addEventListener('fetch', event => {
  const { request } = event;
  if (request.method.toUpperCase() === 'POST') {
    return event.respondWith(handlePOSTRequest(request));
  } 
  else if (request.method.toUpperCase() === 'GET') {
    return event.respondWith(handleGETRequest(request));
  } 
  else {
    return new Response("NOT SUPPORTED", {status: "501", headers: {"content-type": "text/plain"}});
  } 
});
