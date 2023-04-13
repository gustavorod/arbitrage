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

function generateNumericId(): number {
  const uuid = uuidv4().replace(/-/g, ""); // remove dashes from UUID string
  const hex = uuid.substr(0, 16); // take the first 16 hexadecimal digits
  const decimal = parseInt(hex, 16); // convert to decimal
  return decimal;
}

export { mockedConfigService, generateNumericId };
