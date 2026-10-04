package com.mdstech.wealthmesh.clock;

import java.time.Clock;
import java.time.LocalDate;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lets the UI use the server's date, so date pickers agree with the server and with e2e's fixed today. */
@RestController
@RequestMapping("/api/v1/today")
public class TodayController {

    /** The current date in the household's zone. */
    public record Today(LocalDate today) {
    }

    private final Clock clock;

    public TodayController(Clock clock) {
        this.clock = clock;
    }

    @GetMapping
    public Today today() {
        return new Today(LocalDate.now(clock));
    }
}
