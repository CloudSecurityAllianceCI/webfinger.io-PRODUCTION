// Processing content email/html
import { gethtmlContentProcessing } from "./htmlContentProcessing.js"
import { getemailContentProcessing } from "./emailContentProcessing.js"

// npm install uuid
import { v4 as uuidv4 } from 'uuid';

// Processing email handler
import { handleEmail } from "./emailHandler.js"

import { handleVerification } from "./verificationHandler.js"


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export async function readProcessingRequestBodyPOST(request) {
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
  
    /////////////////////////////////////////////////////////////////////////////////////////////////
    // Handle github, logic goes inside each one
    github_id_state = false;
  
    if (request["github_id"] != false) {
      github_id_state = await readProcessingRequestBodyPOSTgithub(request);
    }

  /////////////////////////////////////////////////////////////////////////////////////////////////
  // Handle email, logic goes inside each one
  email_id_state = false;

  if (request["email_address"] != false) {
    email_id_state = await readProcessingRequestBodyPOSTemail(request);
  }

  // Return error for now, we need to chunk this up
  if (github_id_state === false) {
    return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
  }
  else if (email_id_state === false) {
    return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
  }
  /// This should be the response for now
  else {
    return email_id_state;
  }
}

export async function readProcessingRequestBodyPOSTgithub(request) {
  // check to see if we already have an auth key, they auto expire, this cuts down on abuse
  KVkeyValue = "github:" + request["github_id"];
  const KVauthresult = await webfingerio_prod_auth.get(KVkeyValue);
  // if we find an auth record that means we have a unique key already set (which expires after one hour) so 
  // no post request and continue so we don't leak info
  if (KVauthresult) {
    // This means we'll hust ignore it and continue on
    return false;
    // return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
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

    api_return_code = await handleVerification(verify_api_url, verify_api_post); 
    // DEBUG:
    // no return here unbless it's done?
    // return new Response(api_return_code, {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    return "success";
  }
}

export async function readProcessingRequestBodyPOSTemail(request) {

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
      email_id_state = "failure";
      return new Response(gethtmlContentProcessing("badinput"), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }
  }

  // check to see if we already have an auth key, they auto expire, this cuts down on abuse
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
}
