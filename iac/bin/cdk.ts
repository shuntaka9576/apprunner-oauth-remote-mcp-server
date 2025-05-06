#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { McpServerStack } from "../lib/mcp-server-stack.js";

const app = new cdk.App();

new McpServerStack(app, "mcp-server-stack");
