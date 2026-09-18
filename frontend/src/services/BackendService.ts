import { useAuth0 } from "@auth0/auth0-react";


// Provides primitive functions to get data from the backend API.


const RequestType = {
    DELETE: "DELETE",
    GET : "GET",
    POST: "POST",
    PUT : "PUT",
} as const;
type RequestType = (typeof RequestType)[keyof typeof RequestType];
export { RequestType };

const ContentType = {
    JSON: "JSON",
    FORMDATA : "FORMDATA",
} as const;
type ContentType = (typeof ContentType)[keyof typeof ContentType];
export { ContentType };

export interface RequestProps {
    token: String,
    endpoint: string,
    requestType: RequestType,  // 'GET', 'POST', 'DELETE', 'ADD
    bodyContentType: ContentType,
    responseContentType: ContentType,
    body: any,
    setLoading: Function,
    setError: Function
}

export function useToken() {
    const {getAccessTokenWithPopup, getAccessTokenSilently} = useAuth0();

    const getToken = async () : Promise<string> => {
        try {
            let result = await getAccessTokenSilently();
            if (typeof result === "string")
                return result;
            throw new Error("Caught unexpected object: " + result);
        } catch {
            const tokenAttempt: any = await getAccessTokenWithPopup();
            if (typeof tokenAttempt === "string")
                return tokenAttempt;
            return "_INVALID_TOKEN_";
        }
    }

    return { 
        getToken
    };
}

function constructHeaders(requestProps: RequestProps) : { [key: string] : string } {
    if (requestProps.bodyContentType == ContentType.JSON)
        return {
                'Authorization': `Bearer ${requestProps.token}`,
                'Content-Type':  'application/json',
               };
    if (requestProps.bodyContentType == ContentType.FORMDATA)
        return {
                'Authorization': `Bearer ${requestProps.token}`,
               };
    throw new Error("No header formats are specified for ContentType " + requestProps.bodyContentType);
}

function constructBody(requestProps: RequestProps) : any {
    if (requestProps.body == null)
        return null;
    if (requestProps.bodyContentType == ContentType.JSON) {
        return JSON.stringify(requestProps.body, (_key, value) => {
                if (value instanceof Set)
                    return [...value]
                return value;
            });
    }
    if (requestProps.bodyContentType == ContentType.FORMDATA) {
        // Expects a Formdata object.
        return requestProps.body;
    }
    throw new Error("No body formats are specified for ContentType " + requestProps.bodyContentType);
}

async function parseResult(requestProps: RequestProps, response: Response) : Promise<any> {
    if (response.status == 204)
        return;
    if (requestProps.responseContentType == ContentType.JSON) {
        return await response.json();
    }
    if (requestProps.responseContentType == ContentType.FORMDATA) {
        // Expects a Formdata object.
        return await response.blob();
    }
    throw new Error("No body formats are specified for ContentType " + requestProps.responseContentType);
}

// Example endpoint: '/users'
// For background data gathering.
export async function APIRequest(request: RequestProps) : Promise<any> {
    request.setLoading(true);

    let response: Response = await fetch(
            `${import.meta.env.VITE_API_BASE_URL}${request.endpoint}`,
            {
            method: request.requestType,
            headers: constructHeaders(request),
            body: constructBody(request),
        });

    if (!response.ok) {
        const json = await response.json();
        request.setLoading(false);
        request.setError(response.status, json.detail);
        return;
    }

    // Parse result.
    const data = await parseResult(request, response);
    request.setLoading(false);
    return data;
}

export interface BatchContextProps {
    token: String,
    batch: {[key: string] : BatchRequestProps},
    setLoading: Function,
    setError: Function,
}

export interface BatchRequestProps {
    endpoint: string,
    requestType: RequestType,
    contentType: ContentType,
    body: any,
}

function ParseBatchRequests(requests: {[key: string] : BatchRequestProps}) : any {
    const internalDict: {[key: string] : any} = new Object();
    Object.keys(requests).forEach(key => {
        internalDict[key] = {
                url: requests[key].endpoint,
                method: requests[key].requestType,
                body: null
            };
    });

    return { requests : internalDict, include_response_headers: false, };
}

export async function APIBatchRequest(context: BatchContextProps) : Promise<any> {
    let batch: {[key: string] : BatchRequestProps} = context.batch;
    const emptyBatch = Object.keys(batch).length == 0;
    if (emptyBatch) {
        // Generate a simple fake request and void the response.
        batch = {__VOIDABLE__: {
            endpoint: "/void",
            requestType: RequestType.GET,
            contentType: ContentType.JSON,
            body: null,
        }};
    }
    
    const response: {[key: string] : {[key: string] : any}} = await APIRequest({
        token: context.token,
        endpoint: "/batch",
        requestType: RequestType.POST,
        bodyContentType: ContentType.JSON,
        responseContentType: ContentType.JSON,
        body: ParseBatchRequests(batch),
        setLoading: context.setLoading,
        setError: context.setError,
    });

    // Copy the results into a new dictionary, without voidable entries, meanwhile, check for errors.
    const small_dict: {[key: string] : {[key: string] : any}} = {};
    for (var response_key in response["responses"]) {
        if (response_key == "__VOIDABLE__")
            continue;
        const status_code: number = response["responses"][response_key]["status_code"];
        if (!(status_code >= 200 && status_code < 300)) {
            context.setError(status_code, response["responses"][response_key]["detail"]);
            return;
        }
        small_dict[response_key] = response["responses"][response_key]["body"];
    }

    return small_dict;
}