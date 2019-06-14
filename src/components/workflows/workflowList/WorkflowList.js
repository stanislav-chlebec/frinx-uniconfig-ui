import React, {Component} from 'react';
import {Container, Tab, Tabs} from 'react-bootstrap'
import 'react-bootstrap-typeahead/css/Typeahead.css';
import './WorkflowDefs/WorkflowDefs.css'
import WorkflowDefs from "./WorkflowDefs/WorkflowDefs";

class WorkflowList extends Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    render(){
        return (
            <Container style={{textAlign: "left", marginTop: "20px"}}>
                <h1 style={{marginBottom: "20px"}}><i style={{color: 'grey'}} className="fas fa-cogs"/>&nbsp;&nbsp;Workflows</h1>
                <Tabs defaultActiveKey="home" id="uncontrolled-tab-example" style={{marginBottom: "20px"}}>
                    <Tab eventKey="home" title="Definitions">
                        <WorkflowDefs/>
                    </Tab>
                    <Tab eventKey="profile" title="Executed">
                    </Tab>
                    <Tab eventKey="contact" title="Scheduled" disabled>
                    </Tab>
                </Tabs>
            </Container>
        )
    }
}

export default WorkflowList