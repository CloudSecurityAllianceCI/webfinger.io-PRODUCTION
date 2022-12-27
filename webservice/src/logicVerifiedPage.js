
import { gethtmlContentRegistration } from "./htmlContentRegistration.js"

import { strictNormalizeEmailAddress, strictNormalizeGitHub, strictNormalizeMastodon } from "./strictNormalize.js";


import { basicEscapeHTML } from "./strictNormalize.js";


export async function handleVerifiedEmailGETRequest(requestData) {
    
    email_address = requestURL.pathname.slice(1);

    normalized_email_address = strictNormalizeEmailAddress(email_address);

    error_result = {};

    error_result["email_address"] = encodeURIComponent(email_address);

    if (normalized_email_address === false) {
        return new Response(gethtmlContentRegistration("noverifiedemail", error_result) + "normalized", {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }

	// KV STORE get auth key
	KVkeyArray = normalized_email_address.split("@");
	KVkeyValue = "email:" + KVkeyArray[1] + ":" + KVkeyArray[0]
	const KVdataResult = await webfingerio_prod_data.get(KVkeyValue);
    
	// null means no record means no key so throw an error now
	if (KVdataResult === null) {
        return new Response(gethtmlContentRegistration("noverifiedemail", error_result) + "not found", {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
	}
    else {
        KVdataReply = JSON.parse(KVdataResult);
    }

    if (KVdataReply["block_email"] == "Yes") {
        return new Response(gethtmlContentRegistration("noverifiedemail", error_result) + "blocked", {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }

    if (KVdataReply["mastodon_id"]) {
        mastodon_id_raw = KVdataReply["mastodon_id"];
        mastodon_id_normalized = strictNormalizeMastodon(mastodon_id_raw);
        if (mastodon_id_normalized === "") {
            return new Response(gethtmlContentRegistration("noverifiedemail", error_result), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
        }
        else {
            mastodon_id_split = mastodon_id_normalized.split("@");

            let substitute_data = {};
            substitute_data["email_address"] = normalized_email_address;
            substitute_data["mastodon_id"] = mastodon_id_normalized;
            substitute_data["mastodon_name"] = mastodon_id_split[1];
            substitute_data["mastodon_domain"] = mastodon_id_split[2];
            return new Response(gethtmlContentRegistration("verifiedemail", substitute_data), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
        }
    }
}


export async function handleVerifiedGitHubGETRequest(requestData) {
    // github

    raw_request = requestURL.pathname.slice(1);

    github_id_array = raw_request.split("/");

    normalized_github_id = strictNormalizeGitHub(github_id_array[1]);

    error_result = {};

    error_result["github_id"] = encodeURIComponent(normalized_github_id);
    // basicEscapeHTML escape @ and some other stuff we want

    if (normalized_github_id === false) {
        // todo change to "" handler
        return new Response(gethtmlContentRegistration("noverifiedemail", error_result), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
    }

	// KV STORE get auth key
	//KVkeyArray = normalized_github_id.split("@");
    //////////////////////////// TODO FIX FOR MULTIPLE TYPES - lookup table?
	KVkeyValue = "github:" + normalized_github_id;
	const KVdataResult = await webfingerio_prod_data.get(KVkeyValue);
    
	// null means no record means no key so throw an error now
	if (KVdataResult === null) {
        return new Response(gethtmlContentRegistration("noverifiedgithub", error_result), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
	}
    else {
        KVdataReply = JSON.parse(KVdataResult);
    }

    if (KVdataReply["mastodon_id"]) {
        mastodon_id_raw = KVdataReply["mastodon_id"];
        mastodon_id_normalized = strictNormalizeMastodon(mastodon_id_raw);
        if (mastodon_id_normalized === false) {
            return new Response(gethtmlContentRegistration("noverifiedgithub", error_result), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
        }
        else {
            mastodon_id_split = mastodon_id_normalized.split("@");

            let substitute_data = {};
            substitute_data["github_id"] = normalized_github_id;
            substitute_data["mastodon_id"] = mastodon_id_normalized;
            substitute_data["mastodon_name"] = mastodon_id_split[1];
            substitute_data["mastodon_domain"] = mastodon_id_split[2];
            return new Response(gethtmlContentRegistration("verifiedgithub", substitute_data), {status: "200", headers: {"content-type": "text/html;charset=UTF-8"}});
        }
    }
}


