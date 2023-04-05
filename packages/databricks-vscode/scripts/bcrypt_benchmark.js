const bcrypt = require("bcrypt");
const crypto = require("crypto");

// Set up variables
const password = "miles@databricks";
const iterations = 100;

// Benchmark the time it takes to hash the password
const start = performance.now();
for (let iters = 4; iters <= 10; iters++) {
    for (let i = 0; i < iterations; i++) {
        const salt = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex")
            .substring(0, 22);
        const bcryptSalt = `$2b$${iters.toString().padStart(2, "0")}$${salt}`;
        bcrypt.hashSync(password, bcryptSalt);
    }
    const end = performance.now();
    const totalTime = end - start;

    console.log(
        `Hashing ${iterations} passwords with 2^${iters} iterations bcrypt took ${totalTime} milliseconds (average time per round: ${
            totalTime / iterations
        } ms)`
    );
}
