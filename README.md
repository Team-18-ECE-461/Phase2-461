Team Members: Shriya Srinivas, Parv Kumar, Karthik Digavalli
# Trustworthy Module Registry - Phase 2

## Overview
Package Module Regsitry which allows users to rate, upload, update, and remove packages through a web interface.

## Assignment Goal
The goal is to refactor and build upon an existing implementation to:
- Handle complex package management operations.
- Implement scalable and secure deployment using AWS.
- Address performance and cybersecurity requirements.

## Features

### Functional Requirements
- **Package Management**:
  - Upload, update, check ratings, and download packages.
  - Fetch available versions with exact, range, and semantic queries.
- **Search**:
  - Search packages using regular expressions on names and READMEs.
- **Public npm Integration**:
  - Verify and ingest public npm packages meeting quality thresholds.
- **State Management**:
  - Reset the registry to its default state.

 ## How To Deploy
 
 - **To Run Front-End**
   - cd into authentication/authentication-app directory
   - run npm install
   - run npm start
- **To Run Back-End**
   - open a new terminal
   - cd into authentication/authentication-app directory
   - run node server.js



