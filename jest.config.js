export default {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["./test/jest.setup.js"],

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Automatically reset mock state before every test
  resetMocks: true,

  // Adds a location field to test results
  testLocationInResults: true,

  // Indicates whether each individual test should be reported during the run
  verbose: true,
};
