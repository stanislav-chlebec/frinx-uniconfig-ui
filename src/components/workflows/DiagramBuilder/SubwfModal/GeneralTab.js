import React, {Component} from 'react';
import {Form, Col, InputGroup, ButtonGroup, Button} from "react-bootstrap";
import {taskDescriptions} from "../../../constants";

class GeneralTab extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            inputs: this.props.inputs
        };
    }

    componentWillReceiveProps(nextProps) {
        this.setState({
            inputs: nextProps.inputs
        })
    }

    render() {

        let notGeneral = ["type", "subWorkflowParam", "joinOn", "name", "taskReferenceName", "forkTasks", "inputParameters"];
        let taskName = this.state.inputs["name"];
        let taskRefName = this.state.inputs["taskReferenceName"];
        let decisionCases = [];

        const renderTaskName = (item) => (
            <Form.Group>
                <InputGroup size="lg">
                    <InputGroup.Prepend>
                        <InputGroup.Text>name:</InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                        type="input"
                        onChange={(e) => this.props.handleInput(e.target.value, "name")}
                        value={item}/>
                </InputGroup>
                <Form.Text className="text-muted">
                    {taskDescriptions["name"]}
                </Form.Text>
            </Form.Group>
        );

        const renderTaskRefName = (item) => (
            <Form.Group>
                <InputGroup size="lg">
                    <InputGroup.Prepend>
                        <InputGroup.Text>taskReferenceName:</InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                        type="input"
                        onChange={(e) => this.props.handleInput(e.target.value, "taskReferenceName")}
                        value={item}/>
                </InputGroup>
                <Form.Text className="text-muted">
                    {taskDescriptions["taskReferenceName"]}
                </Form.Text>
            </Form.Group>
        );

        const buttonWrappedField = (item, left, right) => (
            <Form.Group>
                <InputGroup>
                    <InputGroup.Prepend>
                        <InputGroup.Text>{item[0]}:</InputGroup.Text>
                    </InputGroup.Prepend>
                    <Form.Control
                        type="input"
                        value={item[1]}/>
                    <InputGroup.Append>
                        <ButtonGroup>
                            <Button variant="outline-primary"
                                    onClick={() => this.props.handleInput(left[1], item[0])}>{left[0]}</Button>
                            <Button variant="outline-primary"
                                    onClick={() => this.props.handleInput(right[1], item[0])}>{right[0]}</Button>
                        </ButtonGroup>
                    </InputGroup.Append>
                </InputGroup>
                <Form.Text className="text-muted">
                    {taskDescriptions[item[0]]}
                </Form.Text>
            </Form.Group>

        );

        return (
            <Form onKeyPress={this.props.handleSave}>
                {renderTaskName(taskName)}
                {renderTaskRefName(taskRefName)}

                <Form.Row>
                    {decisionCases}
                    {Object.entries(this.state.inputs).map((item,i) => {
                        if (!notGeneral.includes(item[0])) {
                            if (item[0] === "decisionCases") {
                                return Object.entries(item[1]).forEach((entry, i) => {
                                    decisionCases.push(
                                        <Col sm={6} key={`colGeneral-${i}`}>
                                            <Form.Group>
                                                <InputGroup>
                                                    <InputGroup.Prepend>
                                                        <InputGroup.Text>decision case #{i}:</InputGroup.Text>
                                                    </InputGroup.Prepend>
                                                    <Form.Control
                                                        type="input"
                                                        onChange={(e) => this.props.handleInput(e.target.value, item[0])}
                                                        value={entry[0]}/>
                                                </InputGroup>
                                                <Form.Text className="text-muted">
                                                    {taskDescriptions[item[0]]}
                                                </Form.Text>
                                            </Form.Group>
                                        </Col>
                                    )
                                });
                            } else {
                                if (item[0] === "optional") {
                                    return (
                                        <Col sm={6} key={`colGeneral-${i}`}>
                                            {buttonWrappedField(item, ["<", !item[1]], [">", !item[1]])}
                                        </Col>
                                    )
                                } else {
                                    return (
                                        <Col sm={6} key={`colGeneral-${i}`}>
                                            <Form.Group>
                                                <InputGroup>
                                                    <InputGroup.Prepend>
                                                        <InputGroup.Text>{item[0]}:</InputGroup.Text>
                                                    </InputGroup.Prepend>
                                                    <Form.Control
                                                        type="input"
                                                        onChange={(e) => this.props.handleInput(e.target.value, item[0])}
                                                        value={item[1]}/>
                                                </InputGroup>
                                                <Form.Text className="text-muted">
                                                    {taskDescriptions[item[0]]}
                                                </Form.Text>
                                            </Form.Group>
                                        </Col>
                                    )
                                }
                            }
                        }
                        return null;
                    })}
                </Form.Row>
            </Form>
        );
    }
}

export default GeneralTab;
