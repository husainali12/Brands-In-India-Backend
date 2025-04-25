const admin = require("../microservices/firebase.service");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const authService = require("../service/authService");

const firebaseAuth =
  (requiredRole = "any") =>
  async (req, res, next) => {
    return new Promise(async (resolve, reject) => {
      const token = req.headers?.authorization?.split(" ")[1];

      if (!token) {
        reject(new ApiError("Please Authenticate!", httpStatus.BAD_REQUEST));
      }

      try {
        const payload = await admin.auth().verifyIdToken(token, true);
        const user = await authService.getUserByFirebaseUId(payload.uid);

        if (!user) {
          if (
            ["/register", "/signup"].includes(req.path) ||
            req.path.includes("register")
          ) {
            req.newUser = payload;
            req.defaultRole = requiredRole === "admin" ? "admin" : "user";
          } else {
            reject(
              new ApiError(
                "User doesn't exist. Please create account",
                httpStatus.NOT_FOUND
              )
            );
          }
        } else {
          if (
            requiredRole !== "any" &&
            user.role !== requiredRole &&
            requiredRole !== "both"
          ) {
            reject(
              new ApiError(
                "You don't have permission to access this resource",
                httpStatus.FORBIDDEN
              )
            );
          }

          if (user.isBlocked) {
            reject(new ApiError("User is blocked", httpStatus.FORBIDDEN));
          }

          if (user.isDeleted) {
            reject(new ApiError("User doesn't exist anymore", httpStatus.GONE));
          }

          req.user = user;
        }

        resolve();
      } catch (err) {
        if (err.code === "auth/id-token-expired") {
          reject(new ApiError("Session is expired", httpStatus.UNAUTHORIZED));
        }
        console.log("FirebaseAuthError:", err);
        reject(new ApiError("Failed to authenticate", httpStatus.UNAUTHORIZED));
      }
    })
      .then(() => next())
      .catch((err) => next(err));
  };

module.exports = firebaseAuth;
