/* The flight director */
function Director() {
    this.planes_arrival = 0;
    this.planes_departure = 0;
    this.lastActionTime = 0;
}

Director.prototype.updateTimeFromLastAction = function() {
    this.lastActionTime = new Date().getTime();
}

Director.prototype.getTimeFromLastAction = function() {
    return ((new Date().getTime()) - this.lastActionTime) / 1000;
}

Director.prototype.scheduleDepartures = function() {

    if (!sceneryLoaded || this.planes_departure >= MAX_DEPARTURES ) {
        return;
    }
    // For each airport ... check for runways active for takeoff
    for (var a = 0; a < airports.length; a++) {
        for (var r = 0; r < runways.length; r++) {
            if (runways[r].icao == airports[a].icao) {
                if (runways[r].active && runways[r].takeoff) {
                    // Runway enabled for takeoffs
                    if (runways[r].last_takeoff_time == 0 || (new Date().getTime() / 1000 - runways[r].last_takeoff_time) > TAKEOFF_INTERVAL) {
                        if (this.getTimeFromLastAction() > DIRECTOR_INTERVAL) {
                            this.updateTimeFromLastAction();
                            this.schedulePlaneTakeoff(airports[a], runways[r]);
                        }
                    }
                }
            }
        }
    }
}

Director.prototype.scheduleArrivals = function() {

    if (!sceneryLoaded || this.planes_arrival >= MAX_ARRIVALS ) {
        return;
    }
    var c = 0;
    for (var p=0; p<planes.length; p++) {
        var o_plane = planes[p];
        if (o_plane.arrival == true) {
            c++;
        }
    }
    if (c >= MAX_ARRIVALS) {
        return;
    }

    // For each airport ... check for runways active for landing
    for (var a = 0; a < airports.length; a++) {
        for (var r = 0; r < runways.length; r++) {
            if (runways[r].icao == airports[a].icao) {
                if (runways[r].active && runways[r].landing) {
                    // Runway enabled for landing
                    if (runways[r].last_arrival_time == 0 || (new Date().getTime() / 1000 - runways[r].last_arrival_time) > ARRIVAL_INTERVAL) {
                        if (this.getTimeFromLastAction() > DIRECTOR_INTERVAL) {
                            this.updateTimeFromLastAction();
                            this.schedulePlaneArrival(airports[a], runways[r]);
                        }
                    }
                }
            }
        }
    }
}

Director.prototype.schedulePlaneTakeoff = function(o_airport, o_runway) {
    console.log('Schedule a plane takeoff from runway ' + o_runway.name + '  at ' + o_airport.name + ' heading = ' + o_runway.heading);

    // Create a new plane
    this.planes_departure++;
    var p = planes.length;
    var o_plane = new Plane();
    o_plane.airp_dep = o_airport.icao;

    // position plane
    o_plane.latitude = o_runway.latitude;
    o_plane.longitude = o_runway.longitude;

    o_plane.fl = 0;
    o_plane.setLevelCleared(0);
    o_plane.speed = 0;
    o_plane.departure = true;
    o_plane.arrival = false;
    o_plane.transit = false;

    console.log('runway coordinates:' + o_plane.latitude + ' - ' + o_plane.longitude);
    o_plane.heading = o_runway.heading;
    o_plane.addStatus(STATUS_DEPARTURE);
    o_plane.addStatus(STATUS_GROUND);
    o_plane.addStatus(STATUS_WAIT_TAKEOFF);
    o_plane.addStatus(STATUS_RADIO_CONTACT_TWR);
    o_plane.atc_phase = PLANE_ATC_DEPARTURE_WARNING;

    o_plane.slot = new Slot();
    o_plane.slot.setTimer(0,0, (this.planes_departure * 60) + Math.floor((Math.random() * 240)));

    o_plane.setPosition();
    o_plane.getTail();
    o_plane.updateStripMode();

    // Select a random Sid Route
    var o_route_sid = this.assignSidRoute(o_airport, o_runway);

    if (o_route_sid != undefined) {
        // Find a possible 2nd leg departure route
        var o_route_next = this.assignNextRoute(o_route_sid);
        o_plane.assignRoute(o_route_sid);
        if (o_route_next != undefined) {
            // Add 2nd leg route
            o_plane.appendSteps(o_route_next.getLegs());
            o_route_ats = this.assignATSRoute(o_route_next);
        }
        else {
            o_route_ats = this.assignATSRoute(o_route_sid);
        }
        if (o_route_ats != undefined) {
            // Add ATS route
            o_plane.appendSteps(o_route_ats.getLegs());
        }

        planes[p] = o_plane;
        mainContainer.addChild(planes[p]);

        // Add Strip
        depStripsContainer.addChild(planes[p].getStrip());
        planes[p].setStripPosition(STRIP_DEPARTURES, depStrips++);
        /*
        depStripsContainer.addChild(planes[p].gStrip);
        planes[p].setStripPosition(depStrips++);
        */

        o_runway.last_takeoff_time = (new Date().getTime() / 1000);
        console.log('heading ' + planes[p].heading);
    }
}

Director.prototype.schedulePlaneArrival = function(o_airport, o_runway) {
    console.log('Schedule a plane arrival to runway ' + o_runway.name + '  at ' + o_airport.name + ' heading = ' + o_runway.heading);

    // Create a new plane
    this.planes_arrival++;
    var p = planes.length;
    var o_plane = new Plane();
    o_plane.airp_dest = o_airport.icao;

    o_plane.addStatus(STATUS_CRUISE);
    o_plane.addStatus(STATUS_ARRIVAL);

    o_runway.last_arrival_time = (new Date().getTime() / 1000);

    var o_route = this.assignArrivalRoute(o_plane, o_airport, o_runway);
    if (o_route != undefined) {
        o_plane.assignRoute(o_route, o_runway.label1);

        // Assign a random cruise level
        o_plane.fl = Math.floor((25000 + (Math.random() * 12000))/1000)*1000;
        o_plane.fl_final = 0;
        o_plane.fl_cleared = this.fl;
        o_plane.climb = 0;
        o_plane.current_step = -1;
        o_plane.atc_phase = PLANE_ATC_OUT;
        o_plane.addStatus(STATUS_RADIO_CONTACT_ATC);
        o_plane.updateStripMode();

        o_plane.slot = new Slot();
        o_plane.slot.setTimer(0,0, Math.floor((Math.random() * 60)));

        // WARNING!! Set plane location near to first waypoint/fix
        if (o_plane.steps.length > 0) {
            // Find first fix leg
            // ...
            var lat1 = o_plane.steps[0].latitude;
            var lon1 = o_plane.steps[0].longitude;
            var pos1 = new LatLon(lat1, lon1);
            // Find second fix leg
                if (o_plane.steps.length > 1) {
                var lat2 = o_plane.steps[1].latitude;
                var lon2 = o_plane.steps[1].longitude;
                var pos2 = new LatLon(lat2, lon2);
                o_plane.heading = pos1.finalBearingTo(pos2);
                var rev_heading = (Math.inverseBearing(o_plane.heading) + (-10 + (Math.random() * 20))) % 360;
                var pos = Math.coordsFromCoarseDistance(lat1, lon1, rev_heading, (5 + (Math.random() * 30)));
                o_plane.latitude = pos.lat;
                o_plane.longitude = pos.lon;
            }
            else {
                o_plane.latitude = lat1;
                o_plane.longitude = lon1;
            }
            o_plane.advance2NextStep();
        }

        planes[p] = o_plane;
        mainContainer.addChild(planes[p]);

        // Add Strip
        arrStripsContainer.addChild(planes[p].getStrip());
        planes[p].setStripPosition(STRIP_ARRIVALS, arrStrips++);

        // console.log('heading ' + planes[p].heading);
    }
}

Director.prototype.assignSidRoute = function(o_airport, o_runway) {
    // Search for a SID route
    var sids = [];
    for (var r=0; r < routes.length; r++) {
        if (routes[r].type == 'SID' && routes[r].icao == o_airport.icao && routes[r].runway == o_runway.label1) {
            sids[sids.length] = routes[r];
        }
    }
    if (sids.length == 0) {
        // TODO no sids
        return undefined;
    }
    var s = Math.floor(Math.random() * sids.length);
    var o_route = sids[s];
    return o_route;
}


/**
 * Search for a 2nd leg route following the given sid route
 * @param o_route
 */
Director.prototype.assignNextRoute = function (o_route) {
    var name = o_route.name;
    var o_lastStep = o_route.getLastLeg();
    var lastFix = o_lastStep.identifier;

    console.log(' nextRoute: ' + name + ' - lastFix = ' + lastFix);

    var candidates = [];
    var o_tmp_route;
    for (var r=0; r < routes.length; r++) {
        o_tmp_route = routes[r];
        if (o_tmp_route.type == 'SID' && o_tmp_route.name == name && o_tmp_route.getLeg(0).identifier == lastFix) {
            candidates[candidates.length] = o_tmp_route;
        }
    }
    if (candidates.length == 0) {
        // No further routes
        return undefined;
    }
    var s = Math.floor(Math.random() * candidates.length);
    console.log(' Find nextRoute: ' + candidates[s].name + ' - ' + candidates[s].name2);
    return candidates[s];
}

/**
 * Search for a ATS route following the given route
 * @param o_route
 */
Director.prototype.assignATSRoute = function (o_route) {
    var name = o_route.name;
    var nLegs = o_route.getLegsNumber();
    var o_lastStep = o_route.getLeg(nLegs-1);
    var o_prevLastStep = o_route.getLeg(nLegs-2);
    var lastFix = o_lastStep.identifier;

    // Compute heading to the last fix
    var coords1 = new LatLon(o_prevLastStep.latitude, o_prevLastStep.longitude);
    var coords2 = new LatLon(o_lastStep.latitude, o_lastStep.longitude);
    var heading = coords1.bearingTo(coords2);

console.log('assignATSRoute: ' + name + ' - lastFix = ' + lastFix + ' heading=' + heading + ' (' + o_prevLastStep.identifier + ' -> ' + o_lastStep.identifier);

    var candidates = [];
    var o_tmp_route;
    for (var r=0; r < ats_routes.length; r++) {
        o_tmp_route = ats_routes[r];
        if (o_tmp_route.type == 'ATS') {
            for (leg=0; leg<o_tmp_route.getLegsNumber(); leg++) {
                var o_step = o_tmp_route.getLeg(leg);
                if (o_step.identifier == lastFix) {
                    // Check for compatible heading (+/- 90 deg)
console.log('check ats route ' + o_tmp_route.name + ' fix ' + o_step.identifier + ' current heading=' + heading + ' ats heading=' + o_step.heading);
                    var diff = Math.abs(heading - o_step.heading);
                    if (diff <= 90 || diff >= 270) {
                        var o_new_ats = new Route();
                        for (x = leg; x < o_tmp_route.getLegsNumber(); x++) {
                            o_new_ats.addLeg(o_tmp_route.getLeg(x));
                        }
console.log('   ATS ok');
                        candidates[candidates.length] = o_new_ats;
                        break;
                    }
                }
            }
        }
    }
    if (candidates.length == 0) {
        // No compatible ATS route
        return undefined;
    }
    var s = Math.floor(Math.random() * candidates.length);
    console.log('ATS Route(' + s + ') = ' + candidates[s].name + ' - ' + candidates[s].name2);
    return candidates[s];
}


Director.prototype.assignArrivalRoute = function(o_plane, o_airport, o_runway) {
    // Search for a STAR route
    var stars = [];
    for (var r=0; r < routes.length; r++) {
        if (routes[r].type == 'STAR' && routes[r].icao == o_airport.icao && (routes[r].runway == o_runway.label1 | routes[r].runway == 'ALL')) {
            stars[stars.length] = routes[r];
        }
    }
    if (stars.length == 0) {
        // TODO no stars
        return undefined;
    }
    var s = Math.floor(Math.random() * stars.length);
    var o_route = stars[s];
    return o_route;
}

Director.prototype.assignFinalRoute = function(o_airport, o_runway, proc_name) {
    // Search for a FINAL route
    var finals = [];
    for (var r=0; r < routes.length; r++) {
        if (routes[r].type == 'FINAL' && routes[r].icao == o_airport.icao && routes[r].runway == o_runway.label1) {
            finals[finals.length] = routes[r];
            if (proc_name != undefined && routes[r].name == proc_name) {
                // Find specific route name
                return routes[r];
            }
        }
    }
    if (finals.length == 0) {
        // TODO no final routes
        return undefined;
    }
    var f = Math.floor(Math.random() * finals.length);
    var o_route = finals[f];
    return o_route;
}


Director.prototype.planeTakeoff = function(o_plane) {
    console.log('Take off plane ' + o_plane.completeCallsign + ' heading ' + o_plane.heading);
    o_plane.removeStatus(STATUS_HOLDING_POINT);
    o_plane.addStatus(STATUS_CLEARED_TAKEOFF);
}

Director.prototype.handleSlots = function() {
    var msg;
    for (p=0; p<planes.length; p++) {
        o_plane = planes[p];
        if (o_plane.hasStatus(STATUS_WAIT_TAKEOFF) && !o_plane.hasStatus(STATUS_CLEARENCE_REQUESTED) && o_plane.slot != undefined) {
            // Check if slot has passed
            if (o_plane.slot.hasPassed(180)) {
                msg = o_plane.completeCallsign + ' ready for departure';
                msgbar.showMessage(msg, MSG_FROM_TWR);
                o_plane.removeStatus(STATUS_WAIT_TAKEOFF);
                o_plane.addStatus(STATUS_CLEARENCE_REQUESTED);
            }
        }
        if (o_plane.hasStatus(STATUS_TAXI) && o_plane.slot.hasPassed()) {
            o_plane.setAtcPhase(PLANE_ATC_DEPARTURE_RELEASE);
            o_plane.removeStatus(STATUS_TAXI);
            o_plane.addStatus(STATUS_HOLDING_POINT);
            o_plane.squack = o_plane.squack_assigned;
            msg = o_plane.completeCallsign + ' ready for takeoff';
            msgbar.showMessage(msg, MSG_FROM_TWR);
        }
        if (o_plane.hasStatus(STATUS_ARRIVAL) && o_plane.hasStatus(STATUS_RADIO_CONTACT_ATC) && !o_plane.hasStatus(STATUS_RELEASE_WARNING) && o_plane.slot != undefined) {
            if (o_plane.slot.hasPassed(180)) {
                msg = o_plane.completeCallsign + ' inbound, ready for release';
                msgbar.showMessage(msg, MSG_FROM_ATC);
                o_plane.addStatus(STATUS_RELEASE_WARNING);
            }
        }
    }
}

Director.prototype.planeRelease = function(planeID) {
    var o_plane = planes[planeID];
    if (o_plane.hasStatus(STATUS_CLEARENCE_REQUESTED)) {
        o_plane.removeStatus(STATUS_CLEARENCE_REQUESTED);
        o_plane.addStatus(STATUS_TAXI);
        if (AUTO_IDENT) {
            o_plane.addStatus(STATUS_IDENT);
        }
        o_plane.slot.setTimer(0,0,180);
        return;
    }
    if (o_plane.hasStatus(STATUS_RADIO_CONTACT_ATC) && o_plane.hasStatus(STATUS_RELEASE_WARNING)) {
        setTimeout( function () {
            o_plane.setAtcPhase(PLANE_ATC_ACTIVE);
            o_plane.removeStatus(STATUS_RELEASE_WARNING);
            o_plane.addStatus(STATUS_RADIO_CONTACT_YOU);
            if (AUTO_IDENT) {
                o_plane.addStatus(STATUS_IDENT);
            }
        }, 10000 + (Math.random() * 20000));
    }

}

Director.prototype.planeDestroy = function(o_plane) {
    var strip_position = o_plane.stripPosition;
    var o_strip = o_plane.getStrip();
    stripRemove(o_plane.stripType, o_plane.stripPosition);
    o_strip.destroy();
}