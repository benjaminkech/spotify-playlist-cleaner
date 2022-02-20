import * as df from "durable-functions";

const entityFunction = df.entity(function (context) {
  const currentValue: number = context.df.getState(() => 0) as number;
  switch (context.df.operationName) {
    case "add": {
      const amount: number = context.df.getInput();
      context.df.setState(currentValue + amount);
      break;
    }
    case "reset": {
      context.df.setState(0);
      break;
    }
    case "get": {
      context.df.return(currentValue);
      break;
    }
  }
});

export default entityFunction;
