import { createServer } from "http";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import {
  ApolloServerPluginDrainHttpServer,
  ApolloServerPluginInlineTrace,
} from "apollo-server-core";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { GraphQLSchema } from "graphql";
import cookieParser from "cookie-parser";

export async function boot(PORT: number, schema: GraphQLSchema) {
  // Create an express application that will serve the GraphQL endpoint
  const expressApp = express();

  // We handle cookies so we can do authentication
  expressApp.use(cookieParser());

  // We wrap the express app into a native http application so we can use the native api
  const httpServer = createServer(expressApp);

  // We create the websocket server using the native http server
  // This allows us to use the same port for both http and websocket
  // The mechanism used is called "upgrade" by "switching protocols"
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  // We create the WS GQL server
  const serverCleanup = useServer({ schema }, wsServer);

  // We create the HTTP GQL server ( with authentication )
  // Since every ws connection is also a http connection, we can use the same authentication
  const apollo = new ApolloServer({
    schema,
    context: ({ req, res }) => {
      const setToken = (token: string) =>
        res.cookie("token", token, {
          expires: new Date(Date.now() + 900000),
          httpOnly: true,
          secure: true,
          sameSite: "none",
        });

      return {
        token: req.cookies.token,
        setToken,
        clearToken: () => res.clearCookie("token"),
      };
    },
    plugins: [
      // Proper shutdown for the HTTP server.
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Inline tracing in Apollo Studio.
      ApolloServerPluginInlineTrace(),
      // Proper shutdown for the WebSocket server.
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  // Starting the Apollo Server
  await apollo.start();

  // Attach the GraphQL endpoint to the express app
  apollo.applyMiddleware({
    app: expressApp,
    cors: {
      origin: ["https://studio.apollographql.com"],
      credentials: true,
    },
  });

  // Listens from the HTTP server because the WS server is attached to the same port
  // And the GQL server is wrapped by the express app
  httpServer.listen(PORT, () => {
    console.log(
      `🚀 Query endpoint ready at http://localhost:${PORT}${apollo.graphqlPath}`
    );
    console.log(
      `🚀 Subscription endpoint ready at ws://localhost:${PORT}${apollo.graphqlPath}`
    );
  });
}
