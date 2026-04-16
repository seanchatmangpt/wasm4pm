export let rules: {
    'no-mocks-in-integration': {
        meta: {
            type: string;
            docs: {
                description: string;
                category: string;
                recommended: string;
            };
            fixable: null;
            schema: never[];
        };
        create(context: any): {
            CallExpression?: undefined;
            MemberExpression?: undefined;
        } | {
            CallExpression(node: any): void;
            CallExpression(node: any): void;
            MemberExpression(node: any): void;
        };
    };
};
//# sourceMappingURL=eslint-plugin.d.cts.map