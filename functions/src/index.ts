import "module-alias/register";
import * as v2 from "firebase-functions/v2";
import express, { Express } from "express";
import cors from "cors";
import routes from "@/routes";


const app: Express = express();

app.use(cors());

app.use(express.json());

app.use(routes);


export const balahiboss = v2.https.onRequest(app);
