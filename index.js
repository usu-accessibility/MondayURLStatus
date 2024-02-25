require('dotenv').config();
let axios = require('axios');
let express = require('express');
let bodyParser = require("body-parser");
let { Agent } = require("undici");

let monday_api_key = process.env.MONDAY_API_KEY;

let app = express();
let port = process.env.PORT || 3012;

app.use(bodyParser.json()); //Handles JSON requests
app.use(bodyParser.urlencoded({extended:true}));


let urlDictionary = {};
let statusCodeArray = {};
let count = 0;
let actualCount = 0;
let finalArray = [];

let status_id = null;
let message_id = null;

// This method adds and edits values in the board using API call
async function addOrEditValuesOfBoard(action, method, item_id = null) {
    let url = "https://api.monday.com/v2";
    let headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${monday_api_key}`
    };

    let data = {
        'query': action
    };

    try {
        let response = await axios.post(url, data, { headers });
        let res = response.data;

        console.log("in in request");
        console.log(res);

        if (method === "getData") {
            // Accumulate all items into a list
            var all_items = res['data']['boards'][0]['items_page']['items'];
            let cursor = res['data']['boards'][0]['items_page']['cursor'];

            // Continue paginating until there are no more items
            while (cursor) {
                let query = `
                    query {
                        next_items_page(limit:500, cursor:"${cursor}") {
                            cursor
                            items {
                                id
                                name
                                column_values {
                                    id
                                    column {
                                        id
                                        title
                                    }
                                    value
                                }
                            }
                        }
                    }
                `;

                data = { 'query': query };
                response = await axios.post(url, data, { headers });
                res = response.data;

                // Append items to the list
                all_items = all_items.concat(res["data"]["next_items_page"]["items"]);
                cursor = res["data"]["next_items_page"]['cursor'];
                console.log(all_items.length);
            }
        }

        if (method === "getData") {
            urlDictionary = {};
            let dataOnBoard = all_items;
            let index = dataOnBoard.findIndex(row => row['id'] === String(item_id));
            let end_index = Math.min(index + 250, dataOnBoard.length);

            for (let idx = index; idx < end_index; idx++) {
                let item_id = dataOnBoard[idx]["id"];
                let item_data = dataOnBoard[idx]["column_values"].find(obj => obj['column']["title"] === "Full URL");

                for (let obj of dataOnBoard[idx]["column_values"]) {
                    if (obj['column']["title"] === "Redirect") {
                        status_id = obj["id"];
                    }
                    if (obj['column']["title"] === "New URL") {
                        message_id = obj["id"];
                    }
                }
                console.log(item_data)

                if (item_data) {
                    console.log(item_data['value'])
                    urlDictionary[item_data['value'].replaceAll('"', "")] = item_id;
                }
            }

            console.log(urlDictionary);
            return [urlDictionary, res];
        } else if (method === "addData") {
            urlDictionary = {};
            let dataOnBoard = res["data"]["items"];

            for (let idx = 0; idx < dataOnBoard.length; idx++) {
                let item_id = dataOnBoard[idx]["id"];
                let item_data = dataOnBoard[idx]["column_values"].find(obj => obj['column']["title"] === "Full URL");

                for (let obj of dataOnBoard[idx]["column_values"]) {
                    if (obj['column']["title"] === "Redirect") {
                        status_id = obj["id"];
                    }
                    if (obj['column']["title"] === "New URL") {
                        message_id = obj["id"];
                    }
                }

                if (item_data) {
                    console.log(item_data)

                    urlDictionary[item_data['value'].replaceAll('"', '')] = item_id;
                }
            }

            return [urlDictionary, res];
        } else if (method === "queueData") {
            return 0;
        } else if (method === "columnTitle") {
            return res["data"]["items"][0]["column_values"][0];
        }

    } catch (error) {
        console.error("Error in addOrEditValuesOfBoard:", error.message);
        throw error;
    }
}

app.get('/', function(req, res){
    res.json({
        message: "application is up and running"
    })
})

app.post('/main', async function(req, res){
    console.log(req.body);
    let bodyJSON = req.body;

    if (bodyJSON != null && 'event' in bodyJSON) {
        res.json(getMethodHandler(bodyJSON));
    } else if (bodyJSON != null && 'challenge' in bodyJSON) {
        res.json(postMethodHandler(req));
    } else if (bodyJSON != null && 'update_board' in bodyJSON) {
        let getTitle = `
            query {
                items(ids: [${bodyJSON['update_board']['itemId']}]) {
                    column_values(ids:["${bodyJSON['update_board']['targetColumnId']}"]){
                        id
                        column {
                            id
                            title
                        }
                        text
                    }
                }
            }
        `;

        try {
            let response = await addOrEditValuesOfBoard(getTitle, "columnTitle");
            res.json(getMethodHandler(bodyJSON, bodyJSON['update_board']['boardId'], bodyJSON['update_board']['itemId'], response['column']['title'], response['text']));
        } catch (error) {
            console.error("Error in update_board:", error.message);
            res.json({
                statusCode: 500,
                body: JSON.stringify({ message: "Internal Server Error" })
            });
        }
    }
    else {
        res.json({
            statusCode: 200,
            body: JSON.stringify('Hello from Lambda!')
        });
    }
})

// Sends back request to monday board when integrating initial using webhooks inorder to establish connection
let postMethodHandler = (event) => {
    return event.body;
};

// Get method gets the data from the monday board
let getMethodHandler = async (req, board_id = null, item_id = null, column_title = null, column_value = null) => {
    statusCodeArray = {};
    count = 0;
    changedLinks = [];
    statusMessage = [];
    actualCount = 0;
    row_length = 0;

    board_id = req["event"]["boardId"] || null;
    item_id = req["event"]["pulseId"] || null;
    column_title = req["event"]["columnTitle"] || null;
    column_value = req["event"]["value"]["label"]["text"] || null;

    let getAndAddColumnData = `
        query {
            items(ids:${item_id}) {
                id
                name
                column_values {
                    id
                    column {
                        id
                        title
                    }
                    value
                }
            }
        }
    `;

    let getBoardDataQuery = `
        query {
            boards(ids:${board_id}) {
                name
                items_page {
                    cursor
                    items {
                        id
                        name
                        column_values {
                            id
                            column {
                                id
                                title
                            }
                            value
                        }
                    }
                }
            }
        }
    `;

    if (column_title && column_value && column_title === "Redirect" && column_value === "Check Redirect") {
        try {
            let response = await addOrEditValuesOfBoard(getAndAddColumnData, "addData");
            callApi(Object.keys(response[0]), response[1], "addData", board_id);
        } catch (error) {
            console.error("Error in Check Redirect:", error.message);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Internal Server Error" })
            };
        }
    } else if (column_title && column_value && column_title === "Redirect" && column_value === "Check All URL's") {
        try {
            let response = await addOrEditValuesOfBoard(getBoardDataQuery, "getData", item_id);
            callApi(Object.keys(response[0]), response[1], "getData", board_id);
        } catch (error) {
            console.error("Error in Check All URL's:", error.message);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Internal Server Error" })
            };
        }
    }
};

// This method checks the prefix of the url and makes call to setStatusUrl method accordingly
let callApi = async (rowData, res, method, board_id) => {
    try {
        count = 0;
        actualCount = 0;
        row_length = rowData.length;

        console.log(rowData);

        for (let idx = 0; idx < row_length; idx++) {
            let prefix = "https://www.";
            let prefix1 = "http://";
            let prefix2 = "https://";
            let url = rowData[idx].trim();

            if (url === prefix || url.trim() === "") {
                continue;
            }

            console.log(url)
            if (url.startsWith(prefix) || url.startsWith(prefix2)) {
                setStatusOfUrl(url, idx + 1, rowData, res, url, method, board_id);
            } else {
                if (url.startsWith(prefix1)) {
                    setStatusOfUrl(url, idx + 1, rowData, res, url, method, board_id);
                } else {
                    setStatusOfUrl("https://" + url, idx + 1, rowData, res, url, method, board_id);
                }
            }
        }
    }
    catch(error){
        console.log(error);
    }
};

// This method checks the status code of the URL and update the monday with details
let setStatusOfUrl = async (url, idx, rowData, res, orgUrl, method, board_id) => {
    let headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36'
    };

    console.log(url)
    try {
        var status_response = await fetch(url, { 
                                        method: 'GET',
                                        headers: headers,
                                        redirect: 'manual',
                                        timeout: 10000,
                                        dispatcher: new Agent({
                                            connect: {
                                              rejectUnauthorized: false,
                                            },
                                          }),
                                    });
        console.log(status_response)
        let data = status_response.status;
        let location = status_response.headers.get('location') || null;
        let statusMessage = status_response.statusText;
    
        if (data >= 300 && data < 310) {
            let checkLink1 = url;
            let checkLink2 = location;
    
            if (checkLink1.replaceAll('www.', '') === checkLink2.replaceAll('www.', '')) {
                pushDataToArray(data, url, "Not changed", statusMessage, orgUrl);
                await updateSheet([url], method, board_id);
            } else {
                pushDataToArray(data, url, location, statusMessage, orgUrl);
                await updateSheet([url], method, board_id);
            }
        } else {
            pushDataToArray(data, url, "Not changed", statusMessage, orgUrl);
            await updateSheet([url], method, board_id);
        }
    
        console.log("fetching the URL status:-", actualCount, "out of", row_length - 1, "URL status fetched");
        count += 1;
        actualCount += 1;
    } 
    catch (error) {
        console.log("error");
        console.log(error);
        pushDataToArray(0, url, "Not changed", "error", orgUrl);
        await updateSheet([url], method, board_id);

        console.log("fetching the URL status:-", actualCount, "out of", row_length - 1, "URL status fetched");
        count += 1;
        actualCount += 1;
        return;
    }
};

let pushDataToArray = (data, url, link, statusMessage, orgUrl) => {
    statusCodeArray[url] = [orgUrl, data, link, statusMessage];
};

// This method updates the monday with redirect status and with the new url
let updateSheet = async (rowData, method, board_id) => {
    try {
        finalArray = [];

        for (let idx = 0; idx < rowData.length; idx++) {
            if (rowData[idx] in statusCodeArray) {
                if (!statusCodeArray[rowData[idx]]) {
                    let prefix1 = "http://";
                    let url1 = rowData[idx].replaceAll("http://", "https://");
                    finalArray.push(statusCodeArray[url1] || null);
                } else {
                    finalArray.push(statusCodeArray[rowData[idx]]);
                }
            }
        }

        console.log("update sheet");
        console.log(finalArray);

        if (finalArray[0]) {
            let value = "";
            let item_id = urlDictionary[finalArray[0][0]];
            let status = finalArray[0][3];
            console.log(status);
            if (["OK", "200", "Found", ""].includes(status.trim())) {
                value = "Ok";
            } else if (status.trim() === "certificate has expired") {
                value = "CertificateHasExpired";
            } else if (["Service Temporarily Unavailable", "Service Unavailable"].includes(status.trim())) {
                value = "ServiceUnavailable";
            } else if (status.trim() === "Forbidden") {
                value = "Forbidden";
            } else if (status.trim() === "Moved Permanently" || (finalArray[0][1] >= 300 && finalArray[0][1] < 310)) {
                value = "MovedPermanently";
            } else if (status.trim() === "Not Found") {
                value = "NotFound";
            } else if (status.trim() === "Not Acceptable") {
                value = "NotAcceptable";
            } else if (status.trim() !== "") {
                value = "Error";
            }

            console.log(value + "=========" + status);
            console.log(finalArray[0][0]);

            console.log(status_id, message_id);

            let column_value = {
                [status_id]: value,
                [message_id]: finalArray[0][2]
            };

            let addNewURLDataQuery = `mutation {
                change_multiple_column_values (board_id: ${board_id}, item_id: ${item_id}, column_values:${JSON.stringify(JSON.stringify(column_value))}) {
                    id
                }
            }`;

            console.log(addNewURLDataQuery);
            await addOrEditValuesOfBoard(addNewURLDataQuery, "editData");
        }
    }
    catch(error){
        console.log(error);
    }
};

app.listen(port, () => {
    console.log("server running on port 3012");
});
