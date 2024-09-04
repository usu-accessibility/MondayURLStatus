import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

monday.setToken(process.env.MONDAY_API_TOKEN!);

export { monday };
