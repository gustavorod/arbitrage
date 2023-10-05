require("dotenv").config();
import { v4 as uuidv4 } from "uuid";

const mockedConfigService = {
  get(key: string) {
    switch (key) {
      case "NODE_ENV":
        return "test";
      default:
        const value = process.env[key];
        return value;
    }
  },
};

function generateNumericId() {
  const utcDate = new Date().toISOString().slice(0, 10); // Get the current UTC date in format YYYY-MM-DD
  const randomNumber = Math.floor(Math.random() * 100000); // Generate a random number between 0 and 100,000
  const cid = parseInt(utcDate.replace(/-/g, "") + randomNumber); // Remove the dashes from the date and append the random number
  return cid;
}

export { mockedConfigService, generateNumericId };
