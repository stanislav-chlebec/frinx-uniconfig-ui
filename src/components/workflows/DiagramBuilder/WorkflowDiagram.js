import {
  fn,
  getEndNode,
  getLinksArray,
  getStartNode,
  getWfInputs,
  handleDecideNode,
  handleForkNode,
  linkNodes
} from "./builder-utils";
import * as _ from "lodash";
import { DefaultNodeModel } from "./NodeModels/DefaultNodeModel/DefaultNodeModel";
import { ForkNodeModel } from "./NodeModels/ForkNode/ForkNodeModel";
import { JoinNodeModel } from "./NodeModels/JoinNode/JoinNodeModel";
import { DecisionNodeModel } from "./NodeModels/DecisionNode/DecisionNodeModel";
import { CircleStartNodeModel } from "./NodeModels/StartNode/CircleStartNodeModel";
import { CircleEndNodeModel } from "./NodeModels/EndNode/CircleEndNodeModel";
import { Application } from "./Application";

const http = require("../../../server/HttpServerSide").HttpClient;

const nodeColors = {
  subWorkflow: "rgb(34,144,255)",
  simpleTask: "rgb(134,210,255)",
  systemTask: "rgb(11,60,139)",
  lambdaTask: "rgb(240,219,79)"
};

export class WorkflowDiagram {
  /**
   * Creates diagram instance with workflow definition
   * @param app - application with diagram model and engine
   * @param definition - workflow definition object
   * @param startPos - position for first node in diagram
   */
  constructor(app = null, definition = null, startPos = null) {
    this.app = app;
    this.definition = definition;
    this.diagramEngine = app.getDiagramEngine();
    this.diagramModel = app.getDiagramEngine().getDiagramModel();
    this.startPos = startPos;
  }

  setDefinition(definition) {
    this.definition = definition;
    return this;
  }

  setStartPosition(startPos) {
    this.startPos = startPos;
    return this;
  }

  getDiagramEngine() {
    return this.diagramEngine;
  }

  getDiagramModel() {
    return this.diagramModel;
  }

  getNodes() {
    return _.toArray(this.diagramModel.getNodes());
  }

  getLinks() {
    return _.toArray(this.diagramModel.getLinks());
  }

  /**
   * Merge prev. definition with new one and saves to db
   * @param finalWorkflow - previous definition
   * @returns {Promise<unknown>}
   */
  saveWorkflow(finalWorkflow) {
    return new Promise((resolve, reject) => {
      const definition = this.parseDiagramToJSON(finalWorkflow);
      http
        .put("/api/conductor/metadata", [definition])
        .then(() => {
          resolve(definition);
        })
        .catch(err => {
          const errObject = JSON.parse(err.response.text);
          if (errObject.validationErrors) {
            reject(errObject.validationErrors[0]);
          }
        });
    });
  }

  /**
   * Creates diagram from definition property
   * clears canvas, puts nodes on canvas, links nodes
   * @returns {WorkflowDiagram}
   */
  createDiagram() {
    const definition = this.definition;
    const tasks = definition.tasks;
    this.clearDiagram();

    tasks.forEach(task => {
      this.createNode(task);
    });

    // link nodes together
    this.linkForkJoinNodes();
    this.linkDecisionNodes();
    this.linkRemainingNodes();

    return this;
  }

  /**
   * Repaints canvas
   * @returns {WorkflowDiagram}
   */
  renderDiagram() {
    this.diagramEngine.repaintCanvas();
    this.diagramEngine.repaintCanvas();
    return this;
  }

  dropNewNode(e) {
    const data = JSON.parse(e.dataTransfer.getData("storm-diagram-node"));
    const points = this.diagramEngine.getRelativeMousePoint(e);
    const task = { name: data.name, ...data.wfObject };
    const { diagramModel, diagramEngine } = this;

    let node = null;

    switch (data.type) {
      case "default":
        node = this.placeDefaultNode(task, points.x, points.y);
        break;
      case "start":
        node = this.placeStartNode(points.x, points.y);
        break;
      case "end":
        node = this.placeEndNode(points.x, points.y);
        break;
      case "fork":
        node = this.placeForkNode(task, points.x, points.y);
        break;
      case "join":
        node = this.placeJoinNode(task, points.x, points.y);
        break;
      case "decision":
        node = this.placeDecisionNode(task, points.x, points.y);
        break;
      case "lambda":
        node = this.placeLambdaNode(task, points.x, points.y);
        break;
      default:
        break;
    }

    diagramModel.addNode(node);
    diagramEngine.repaintCanvas();
  }

  /**
   * Clears canvas (removes nodes and link)
   */
  clearDiagram() {
    _.values(this.diagramModel.getNodes()).forEach(node => {
      this.diagramModel.removeNode(node);
    });

    _.values(this.diagramModel.getLinks()).forEach(link => {
      this.diagramModel.removeLink(link);
    });
  }

  /**
   * Places Start and End node on constant positions
   * @returns {WorkflowDiagram}
   */
  placeDefaultNodes() {
    this.diagramEngine.setDiagramModel(this.diagramModel);
    this.diagramModel.addAll(
      this.placeStartNode(900, 300),
      this.placeEndNode(1200, 300)
    );
    return this;
  }

  /**
   * Appends diagram with Start and End node
   * @returns {WorkflowDiagram}
   */
  withStartEnd() {
    const diagramModel = this.diagramModel;
    const firstNode = _.first(this.getNodes());
    const lastNode = _.last(this.getNodes());

    const startNode = this.placeStartNode(firstNode.x - 150, firstNode.y);
    const endNode = this.placeEndNode(
      lastNode.x + this.getNodeWidth(lastNode) + 150,
      lastNode.y
    );

    // decision special case
    if (_.last(this.definition.tasks).type === "DECISION") {
      const decisionNode = this.getMatchingNode(
        _.last(this.definition.tasks).taskReferenceName
      );

      [
        Object.values(decisionNode.extras.inputs.decisionCases)[0],
        decisionNode.extras.inputs.defaultCase,
        Object.values(decisionNode.extras.inputs.decisionCases)[1]
      ].forEach(branch =>
        diagramModel.addLink(
          this.linkNodes(
            this.getMatchingNode(_.last(branch).taskReferenceName),
            endNode
          )
        )
      );

      endNode.setPosition(this.getMostRightNodeX() + 150, decisionNode.y);
    }

    this.diagramModel.addAll(
      this.linkNodes(startNode, firstNode),
      this.linkNodes(lastNode, endNode)
    );
    diagramModel.addAll(startNode, endNode);

    return this;
  }

  placeStartNode(x, y) {
    const node = new CircleStartNodeModel("Start");
    node.setPosition(x, y);
    return node;
  }

  placeEndNode(x, y) {
    const node = new CircleEndNodeModel("End");
    node.setPosition(x, y);
    return node;
  }

  placeDefaultNode(task, x, y) {
    const color =
      task.type === "SUB_WORKFLOW"
        ? nodeColors.subWorkflow
        : nodeColors.simpleTask;
    const node = new DefaultNodeModel(task.name, color, task);
    node.setPosition(x, y);
    return node;
  }

  placeForkNode = (task, x, y) => {
    let node = new ForkNodeModel(task.name, nodeColors.systemTask, task);
    node.setPosition(x, y);
    return node;
  };

  placeJoinNode = (task, x, y) => {
    let node = new JoinNodeModel(task.name, nodeColors.systemTask, task);
    node.setPosition(x, y);
    return node;
  };

  placeDecisionNode = (task, x, y) => {
    let node = new DecisionNodeModel(task.name, nodeColors.systemTask, task);
    node.setPosition(x, y);
    return node;
  };

  placeLambdaNode = (task, x, y) => {
    let node = new DefaultNodeModel(task.name, nodeColors.lambdaTask, task);
    node.setPosition(x, y);
    return node;
  };

  getMostRightNodeX() {
    let max = 0;
    this.getNodes().forEach(node => {
      if (node.x > max) {
        max = node.x;
      }
    });
    return max;
  }

  getNodeWidth(node) {
    if (node.name.length > 6) {
      return node.name.length * 6;
    }
    return node.name.length * 12;
  }

  /**
   * Finds node with matching name to taskName
   * @param taskName - name of node to find (based on task)
   * @returns {unknown}
   */
  getMatchingNode(taskName) {
    return _.toArray(this.getNodes()).find(
      x => x.extras.inputs.taskReferenceName === taskName
    );
  }

  /**
   * Links all nodes that are left unlinked (defaults)
   */
  linkRemainingNodes() {
    this.getNodes().forEach((node, i) => {
      _.values(node.ports).forEach(port => {
        if (
          (port.in || port.name === "left" || port.name === "inputPort") &&
          _.isEmpty(port.links)
        ) {
          if (i !== 0) {
            this.diagramModel.addLink(
              this.linkNodes(this.getNodes()[i - 1], node)
            );
          }
        }
      });
    });
  }

  linkForkJoinNodes() {
    this.getNodes().forEach(node => {
      if (node.type === "fork") {
        let forkTasks = node.extras.inputs.forkTasks;
        let firstInBranch = [];
        let lastInBranch = [];

        // find first and last nodes in branches
        forkTasks.forEach(branch => {
          let firstBranchNode = this.getMatchingNode(
            _.first(_.toArray(branch)).taskReferenceName
          );
          let lastBranchNode = this.getMatchingNode(
            _.last(_.toArray(branch)).taskReferenceName
          );

          firstInBranch.push(firstBranchNode);
          lastInBranch.push(lastBranchNode);
        });

        // connect fork -> first nodes
        firstInBranch.forEach(firstNode => {
          this.diagramModel.addLink(this.linkNodes(node, firstNode));
        });

        // find join node pair for fork node
        let tasks = this.definition.tasks;
        let joinNodes = fn(tasks, "joinOn");
        let joinNodePair = null;

        joinNodes.forEach(joinNode => {
          if (
            joinNode.joinOn.includes(
              lastInBranch[0].extras.inputs.taskReferenceName
            )
          ) {
            joinNodePair = this.getMatchingNode(joinNode.taskReferenceName);
          }
        });

        // connect last nodes -> join
        if (joinNodePair) {
          lastInBranch.forEach(lastNode => {
            this.diagramModel.addLink(this.linkNodes(lastNode, joinNodePair));
          });
        }
      }
    });
  }

  linkDecisionNodes() {
    this.getNodes().forEach((node, pos) => {
      if (node.type === "decision") {
        let decisionCases = [
          Object.values(node.extras.inputs.decisionCases)[0],
          node.extras.inputs.defaultCase,
          Object.values(node.extras.inputs.decisionCases)[1]
        ];
        let firstInBranch = [];
        let lastInBranch = [];

        // find first and last nodes in branches
        decisionCases.forEach(branch => {
          let firstBranchNode = this.getMatchingNode(
            _.first(_.toArray(branch)).taskReferenceName
          );
          let lastBranchNode = this.getMatchingNode(
            _.last(_.toArray(branch)).taskReferenceName
          );

          firstInBranch.push(firstBranchNode);
          lastInBranch.push(lastBranchNode);
        });

        // find neutral node (first node after decision block)
        let decisionCaseTasksArray = [];

        decisionCases.forEach(branch => {
          branch.forEach(task => {
            if (task.type === "FORK_JOIN") {
              decisionCaseTasksArray.push(task);
              decisionCaseTasksArray.push(...fn(task.forkTasks, "name"));
            } else {
              decisionCaseTasksArray.push(task);
            }
          });
        });

        let neutralNode = this.getNodes()[
          pos + decisionCaseTasksArray.length + 1
        ];

        // connect decision -> first nodes
        firstInBranch.forEach((firstNode, k) => {
          let whichPort = ["failPort", "neutralPort", "completePort"];
          this.diagramModel.addLink(
            this.linkNodes(node, firstNode, whichPort[k])
          );
        });

        // connect last nodes -> neutral node
        if (neutralNode) {
          lastInBranch.forEach(lastNode => {
            this.diagramModel.addLink(this.linkNodes(lastNode, neutralNode));
          });
        }
      }
    });
  }

  /**
   * Links two nodes together ( out -> in )
   * @param node1 - output node
   * @param node2 - input node
   * @param whichPort - optional parameter to target specific port
   * @returns {LinkModel|*}
   */
  linkNodes(node1, node2, whichPort) {
    if (
      node1.type === "fork" ||
      node1.type === "join" ||
      node1.type === "start"
    ) {
      const fork_join_start_outPort = node1.getPort("right");

      if (node2.type === "default") {
        return fork_join_start_outPort.link(node2.getInPorts()[0]);
      }
      if (node2.type === "decision") {
        return fork_join_start_outPort.link(node2.getPort("inputPort"));
      }
      if (["fork", "join", "end"].includes(node2.type)) {
        return fork_join_start_outPort.link(node2.getPort("left"));
      }
    } else if (node1.type === "default") {
      const defaultOutPort = node1.getOutPorts()[0];

      if (node2.type === "default") {
        return defaultOutPort.link(node2.getInPorts()[0]);
      }
      if (node2.type === "decision") {
        return defaultOutPort.link(node2.getPort("inputPort"));
      }
      if (["fork", "join", "end"].includes(node2.type)) {
        return defaultOutPort.link(node2.getPort("left"));
      }
    } else if (node1.type === "decision") {
      const currentPort = node1.getPort(whichPort);

      if (node2.type === "default") {
        return currentPort.link(node2.getInPorts()[0]);
      }
      if (node2.type === "decision") {
        return currentPort.link(node2.getPort("inputPort"));
      }
      if (["fork", "join", "end"].includes(node2.type)) {
        return currentPort.link(node2.getPort("left"));
      }
    }
  }

  /**
   * Calculates position for node based on other nodes position
   * @param branchX - if nested, offset X position
   * @param branchY - if nested, offset Y position
   * @returns {{x: *, y: *}}
   */
  calculatePosition(branchX, branchY) {
    const nodes = this.getNodes();
    const startPos = this.startPos;
    let x = 0;
    let y = 0;

    if (_.isEmpty(nodes)) {
      x = startPos.x;
      y = startPos.y;
    } else {
      x =
        this.getMostRightNodeX() +
        this.getNodeWidth(nodes[nodes.length - 1]) +
        50;
      y = startPos.y;
    }

    if (branchX) {
      x = branchX;
    }
    if (branchY) {
      y = branchY;
    }

    return { x, y };
  }

  /**
   * Calculates position when rendering forkTasks nodes
   * @param branchTask - task in branch
   * @param parentX - X position of parent branch
   * @param parentY - Y position of parent branch
   * @param k - iterator of task in branch
   * @param branchSpread - wideness of fork chunk (including margin between)
   * @param branchMargin - margin between branches
   * @param branchNum - iterator of fork branches
   * @param forkDepth - depth of nested fork (default 1)
   * @returns {{branchPosY: *, branchPosX: *}}
   */
  calculateNestedPosition(
    branchTask,
    parentX,
    parentY,
    k,
    branchSpread,
    branchMargin,
    branchNum,
    forkDepth
  ) {
    let branchPosX = 0;
    let yOffset = branchTask.type === "FORK_JOIN" ? 25 - k * 11 : 27;
    yOffset = branchTask.type === "JOIN" ? 25 - (k - 1) * 11 : yOffset;

    const branchPosY =
      parentY +
      yOffset -
      branchSpread / 2 +
      ((branchMargin + 47) * branchNum) / forkDepth;
    const lastNode = this.getNodes()[this.getNodes().length - 1];

    if (branchTask.type === "JOIN") {
      branchPosX = this.getMostRightNodeX() + 220;
    } else {
      branchPosX = parentX + 220 + k * (this.getNodeWidth(lastNode) + 50);
    }
    return { branchPosX, branchPosY };
  }

  /**
   * Creates new node on calculated position
   * @param task - task definition
   * @param branchX (optional)
   * @param branchY (optional)
   * @param forkDepth (optional)
   */
  createNode(task, branchX, branchY, forkDepth = 1) {
    switch (task.type) {
      case "SUB_WORKFLOW": {
        const { x, y } = this.calculatePosition(branchX, branchY);
        const node = this.placeDefaultNode(task, x, y);
        this.diagramModel.addNode(node);
        break;
      }
      case "FORK_JOIN": {
        const { x, y } = this.calculatePosition(branchX, branchY);
        const branchCount = task.forkTasks.length;
        const branchMargin = 100;
        const nodeHeight = 47;

        const node = this.placeForkNode(task, x, y);
        this.diagramModel.addNode(node);

        // branches size in parallel - the deeper the fork node, the smaller the spread and margin is
        const branchSpread =
          (branchCount * nodeHeight + (branchCount - 1) * branchMargin) /
          forkDepth;

        task.forkTasks.forEach((branch, branchNum) => {
          branch.forEach((branchTask, k) => {
            const { branchPosX, branchPosY } = this.calculateNestedPosition(
              branchTask,
              x,
              y,
              k,
              branchSpread,
              branchMargin,
              branchNum,
              forkDepth
            );
            this.createNode(branchTask, branchPosX, branchPosY, forkDepth + 1);
          });
        });
        break;
      }
      case "DECISION": {
        const { x, y } = this.calculatePosition(branchX, branchY);
        const caseCount = _.values(task.decisionCases).length + 1;
        const branchMargin = 100;
        const nodeHeight = 47;
        const node = this.placeDecisionNode(task, x, y);
        this.diagramModel.addNode(node);

        // branches size in parallel - the deeper the fork node, the smaller the spread and margin is
        const branchSpread =
          (caseCount * nodeHeight + (caseCount - 1) * branchMargin) / forkDepth;

        const branches = [
          Object.values(task.decisionCases)[0],
          task.defaultCase,
          Object.values(task.decisionCases)[1]
        ];

        branches.forEach((caseBranch, caseNum) => {
          caseBranch.forEach((branchTask, k) => {
            const { branchPosX, branchPosY } = this.calculateNestedPosition(
              branchTask,
              x,
              y,
              k,
              branchSpread,
              branchMargin,
              caseNum,
              forkDepth
            );
            this.createNode(branchTask, branchPosX, branchPosY, forkDepth + 1);
          });
        });
        break;
      }
      case "JOIN": {
        const { x, y } = this.calculatePosition(branchX, branchY);
        const node = this.placeJoinNode(task, x, y);
        this.diagramModel.addNode(node);
        break;
      }
      case "LAMBDA": {
        const { x, y } = this.calculatePosition(branchX, branchY);
        const node = this.placeLambdaNode(task, x, y);
        this.diagramModel.addNode(node);
        break;
      }
      default: {
        const { x, y } = this.calculatePosition(branchX, branchY);
        const node = this.placeDefaultNode(task, x, y);
        this.diagramModel.addNode(node);
        break;
      }
    }
  }

  /**
   * Traverses diagram nodes (links) to create JSON definition
   * @param finalWorkflow
   */
  parseDiagramToJSON(finalWorkflow) {
    let parentNode = getStartNode(this.getLinks());
    let endNode = getEndNode(this.getLinks());
    let linksArray = this.getLinks();
    let tasks = [];

    if (!parentNode) {
      throw new Error("Start node is not connected.");
    }
    if (!endNode) {
      throw new Error("End node is not connected.");
    }

    while (parentNode.type !== "end") {
      for (let i = 0; i < linksArray.length; i++) {
        let link = linksArray[i];

        if (link.sourcePort.parent === parentNode) {
          switch (link.targetPort.type) {
            case "fork":
              let { forkNode, joinNode } = handleForkNode(
                link.targetPort.getNode()
              );
              tasks.push(forkNode.extras.inputs, joinNode.extras.inputs);
              parentNode = joinNode;
              break;
            case "decision":
              let { decideNode, firstNeutralNode } = handleDecideNode(
                link.targetPort.getNode()
              );
              tasks.push(decideNode.extras.inputs);
              if (firstNeutralNode) {
                if (firstNeutralNode.extras.inputs) {
                  tasks.push(firstNeutralNode.extras.inputs);
                }
                parentNode = firstNeutralNode;
              } else {
                throw new Error("Default decision route is missing.");
              }
              break;
            case "end":
              parentNode = link.targetPort.parent;
              break;
            default:
              parentNode = link.targetPort.parent;
              tasks.push(parentNode.extras.inputs);
              break;
          }
        }
      }
    }

    let finalWf = { ...finalWorkflow };

    // handle input params
    if (Object.keys(getWfInputs(finalWf)).length < 1) {
      finalWf.inputParameters = [];
    }

    // handle tasks
    finalWf.tasks = tasks;
    this.definition = finalWf;

    return finalWf;
  }

  /**
   * Removes selected nodes from diagram model, inserts new nodes from
   * selected nodes definition.
   */
  expandSelectedNodes() {
    const selectedNodes = this.diagramModel.getSelectedItems().filter(item => {
      return item.getType() === "default";
    });

    selectedNodes.forEach(selectedNode => {
      if (!selectedNode.extras.inputs.subWorkflowParam) {
        throw new Error("Simple task can't be expanded");
      }

      const { name, version } = selectedNode.extras.inputs.subWorkflowParam;
      const inputLinkArray = getLinksArray("in", selectedNode);
      const outputLinkArray = getLinksArray("out", selectedNode);

      if (!inputLinkArray || !outputLinkArray) {
        throw new Error("Selected node is not connected.");
      }

      const inputLinkParents = inputLinkArray.map(inputLink => {
        return inputLink.sourcePort.getNode();
      });

      const outputLinkParents = outputLinkArray.map(outputLink => {
        return outputLink.targetPort.getNode();
      });

      http
        .get("/api/conductor/metadata/workflow/" + name + "/" + version)
        .then(res => {
          const subworkflowDiagram = new WorkflowDiagram(
            new Application(),
            res.result,
            selectedNode
          );

          subworkflowDiagram.createDiagram();

          const firstNode = _.first(subworkflowDiagram.getNodes());
          let lastNodes = [];

          // decision special case
          if (_.last(res.result.tasks).type === "DECISION") {
            const decisionNode = subworkflowDiagram.getMatchingNode(
              _.last(res.result.tasks).taskReferenceName
            );

            lastNodes = [
              Object.values(decisionNode.extras.inputs.decisionCases)[0],
              decisionNode.extras.inputs.defaultCase,
              Object.values(decisionNode.extras.inputs.decisionCases)[1]
            ].map(branch => {
                return subworkflowDiagram.getMatchingNode(_.last(branch).taskReferenceName)
              }
            );
          } else {
             lastNodes.push(_.last(subworkflowDiagram.getNodes()));
          }

          selectedNode.remove();
          this.diagramModel.removeNode(selectedNode);

          inputLinkArray.forEach(link => {
            this.diagramModel.removeLink(link);
          });

          outputLinkArray.forEach(link => {
            this.diagramModel.removeLink(link);
          });

          const newLinksFirst = inputLinkParents.map((node, i) => {
            return linkNodes(
              node,
              firstNode,
              inputLinkArray[i].sourcePort.name
            );
          });

          let newLinksLast = [];
          outputLinkParents.forEach(node => {
            lastNodes.forEach(n => {
              newLinksLast.push(linkNodes(n, node))
            });
          });

          this.diagramModel.addAll(
            ...subworkflowDiagram.getNodes(),
            ...subworkflowDiagram.getLinks(),
            ...newLinksFirst,
            ...newLinksLast
          );
          this.diagramEngine.setDiagramModel(this.diagramModel);
          this.diagramEngine.repaintCanvas();
          this.renderDiagram();
        })
        .catch(() => {
          console.log(`Subworkflow ${name} doesn't exit.`);
        });
    });
  }
}